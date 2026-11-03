from fontTools.ttLib import TTFont
import sys,json,hashlib,math
MAX_WORK=1000000
class Unsupported(Exception):pass
def build(path,alphabet):
 work=0
 def tick(n=1):
  nonlocal work;work+=n
  if work>MAX_WORK:raise Unsupported('CERTIFICATE_WORK_LIMIT')
 raw=open(path,'rb').read()
 if len(raw)>10*1048576:raise Unsupported('FONT_BYTES')
 f=TTFont(path,recalcTimestamp=False);order=f.getGlyphOrder()
 if len(order)>4096 or any(t in f for t in ['fvar','gvar','HVAR','MVAR','CFF ','CFF2','kern','kerx','morx','mort','trak']):raise Unsupported('UNSUPPORTED_FONT_PROFILE')
 if not all(t in f for t in ['glyf','loca','hmtx','head','cmap']):raise Unsupported('TRUETYPE_REQUIRED')
 upm=f['head'].unitsPerEm
 if not 16<=upm<=16384:raise Unsupported('UPEM')
 alphabet=''.join(sorted(set(alphabet)))
 if not alphabet or any(not 32<=ord(c)<=126 for c in alphabet):raise Unsupported('ASCII_ALPHABET_REQUIRED')
 cmap=f.getBestCmap();initial={cmap.get(ord(c),'.notdef')for c in alphabet}
 if '.notdef'in initial:raise Unsupported('MISSING_GLYPH')
 for table in f['cmap'].tables:
  if table.platformID==3 and table.platEncID==0:raise Unsupported('SYMBOL_CMAP')
  if table.isUnicode()and table.format!=14 and any(table.cmap.get(ord(c))!=cmap.get(ord(c))for c in alphabet):raise Unsupported('AMBIGUOUS_CMAP')
 lookups=f['GSUB'].table.LookupList.Lookup if 'GSUB'in f else[]
 if len(lookups)>256:raise Unsupported('LOOKUP_LIMIT')
 reach=set(initial)
 for step in range(len(order)+1):
  before=len(reach)
  for lookup in lookups:
   for rawSub in lookup.SubTable:
    tick();typ=lookup.LookupType;s=rawSub
    if typ==7:typ=s.ExtensionLookupType;s=s.ExtSubTable
    if typ==1:
     for a,b in s.mapping.items():
      tick()
      if a in reach:reach.add(b)
    elif typ==2:
     for a,bs in s.mapping.items():
      tick()
      if a in reach:
       if len(bs)!=1:raise Unsupported('REACHABLE_GLYPH_COUNT_CHANGE')
       reach.update(bs)
    elif typ==3:
     for a,bs in s.alternates.items():
      tick(len(bs)+1)
      if a in reach:reach.update(bs)
    elif typ==4:
     for a,ls in s.ligatures.items():
      for lig in ls:
       tick(len(lig.Component)+1)
       if a in reach and all(g in reach for g in lig.Component):reach.add(lig.LigGlyph)
    elif typ==8:
     for a,b in zip(s.Coverage.glyphs,s.Substitute):
      tick()
      if a in reach:reach.add(b)
    elif typ not in[5,6]:raise Unsupported('UNKNOWN_GSUB')
    # Contextual actions invoke the same lookups whose primitive actions are
    # all included above. Ignoring context overapproximates reachable glyphs.
  if '.notdef'in reach or any(g not in f['hmtx'].metrics for g in reach):raise Unsupported('INVALID_REACHABLE_GLYPH')
  if len(reach)>2048:raise Unsupported('GLYPH_CLOSURE_LIMIT')
  if len(reach)==before:break
 else:raise Unsupported('CLOSURE_LIMIT')
 if 'GDEF'in f:
  gd=getattr(f['GDEF'].table,'GlyphClassDef',None)
  if gd and any(gd.classDefs.get(g)==3 for g in reach):raise Unsupported('REACHABLE_MARK_CLASS')
 # Per-glyph [min/max advance adjustment,min/max x placement] bounds.
 total={g:[0,0,0,0]for g in reach};passes=[]
 def record(v):
  if v is None:return 0,0
  data=vars(v)
  if any(k not in['XAdvance','XPlacement','YAdvance','YPlacement']and value is not None for k,value in data.items()):raise Unsupported('DEVICE_OR_UNKNOWN_POSITION')
  if data.get('YAdvance',0)!=0:raise Unsupported('VERTICAL_ADVANCE')
  a=data.get('XAdvance',0);p=data.get('XPlacement',0)
  if not all(isinstance(x,int)and -32768<=x<=32767 for x in[a,p]):raise Unsupported('VALUE_RANGE')
  return a,p
 def update(store,g,v):
  a,p=record(v);x=store[g];x[0]=min(x[0],a);x[1]=max(x[1],a);x[2]=min(x[2],p);x[3]=max(x[3],p)
 if 'GPOS'in f:
  table=f['GPOS'].table
  if getattr(table,'FeatureVariations',None):raise Unsupported('FEATURE_VARIATIONS')
  if len(table.LookupList.Lookup)>256:raise Unsupported('LOOKUP_LIMIT')
  features=table.FeatureList.FeatureRecord
  for index,lookup in enumerate(table.LookupList.Lookup):
   tags={x.FeatureTag for x in features if index in x.Feature.LookupListIndex};multiplicity=len(tags)+1
   adjusted={g:[0,0,0,0]for g in reach}
   for rawSub in lookup.SubTable:
    tick();typ=lookup.LookupType;s=rawSub
    if typ==9:typ=s.ExtensionLookupType;s=s.ExtSubTable
    if typ in[7,8]:raise Unsupported('CONTEXTUAL_GPOS')
    if typ==3:
     if set(s.Coverage.glyphs)&reach:raise Unsupported('REACHABLE_CURSIVE')
     continue
    if typ in[4,5,6]:
     marks=s.Mark1Coverage.glyphs if typ==6 else s.MarkCoverage.glyphs
     if set(marks)&reach:raise Unsupported('REACHABLE_POSITIONED_MARK')
     continue
    left={g:[0,0,0,0]for g in reach};right={g:[0,0,0,0]for g in reach}
    if typ==1:
     if s.Format==1:
      for g in set(s.Coverage.glyphs)&reach:tick();update(left,g,s.Value)
     elif s.Format==2:
      for g,v in zip(s.Coverage.glyphs,s.Value):
       tick()
       if g in reach:update(left,g,v)
     else:raise Unsupported('UNKNOWN_SINGLE_POS')
    elif typ==2:
     if s.Format==1:
      for a,pairset in zip(s.Coverage.glyphs,s.PairSet):
       if a not in reach:continue
       for pair in pairset.PairValueRecord:
        tick()
        if pair.SecondGlyph in reach:update(left,a,pair.Value1);update(right,pair.SecondGlyph,pair.Value2)
     elif s.Format==2:
      first={};second={}
      for g in set(s.Coverage.glyphs)&reach:first.setdefault(s.ClassDef1.classDefs.get(g,0),[]).append(g)
      for g in reach:second.setdefault(s.ClassDef2.classDefs.get(g,0),[]).append(g)
      for a,gs in first.items():
       for b,hs in second.items():
        tick(len(gs)+len(hs));rec=s.Class1Record[a].Class2Record[b]
        for g in gs:update(left,g,rec.Value1)
        for g in hs:update(right,g,rec.Value2)
     else:raise Unsupported('UNKNOWN_PAIR_POS')
    else:raise Unsupported('UNKNOWN_GPOS')
    for g in reach:
     for k in range(4):adjusted[g][k]+=left[g][k]+right[g][k]
   for g in reach:
    for k in range(4):total[g][k]+=adjusted[g][k]*multiplicity
   passes.append({'lookup':index,'tags':sorted(tags),'passUpper':multiplicity})
 maxAdvance=0;minAdvance=65535;offset=0;leftInk=0;rightInk=0
 for g in reach:
  tick();nominal=f['hmtx'].metrics[g][0];lo,hi,pl,pr=total[g]
  if nominal+lo<0:raise Unsupported('NONNEGATIVE_ADVANCE_UNPROVEN')
  minAdvance=min(minAdvance,nominal+lo);maxAdvance=max(maxAdvance,nominal+hi);offset=max(offset,abs(pl),abs(pr));glyph=f['glyf'][g]
  if getattr(glyph,'numberOfContours',0)!=0:
   leftInk=min(leftInk,glyph.xMin);rightInk=max(rightInk,glyph.xMax)
 if maxAdvance>1000000 or offset>1000000:raise Unsupported('METRIC_RANGE')
 return{'ready':True,'kind':'r0-ascii-closure-glyf-gpos-bound-v1','fontSha256':hashlib.sha256(raw).hexdigest(),'alphabet':alphabet,'unitsPerEm':upm,'maxAdvanceUnits':maxAdvance,'minAdvanceUnits':minAdvance,'maxAbsXPlacementUnits':offset,'minInkLeftUnits':leftInk,'maxInkRightUnits':rightInk,'reachableGlyphCount':len(reach),'inputGlyphCountFactor':1,'gposPassBounds':passes,'work':work,'workLimit':MAX_WORK,'qualification':'Private lab compiler result, not a client-supplied certificate or production API. ASCII only; nonincreasing GSUB; unsupported variation/device/context-position/mark/cursive cases fall back.'}
# Private packaged compiler. Input is created by the owning runtime, never a document certificate.
try:
 request=json.load(sys.stdin)
 out=build(request['fontPath'],request['alphabet'])
 if out.get('ready') and out['fontSha256']!=request['sha256']:out={'ready':False,'reason':'FONT_HASH_MISMATCH'}
except Exception as e:out={'ready':False,'reason':type(e).__name__}
print(json.dumps(out))
