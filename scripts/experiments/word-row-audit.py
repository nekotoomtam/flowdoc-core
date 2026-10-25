"""Frozen native row comparison. Page counts alone are not acceptance."""
from pathlib import Path
import json,re,collections,statistics,hashlib
import pdfplumber,pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image,ImageDraw
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e8'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));body=next(s for s in m['sections'] if s['sectionId']=='body')
cal=json.loads((D/'calibration.json').read_text(encoding='utf8'));priorCal=json.loads((O/'pagination-e7/calibration.json').read_text(encoding='utf8'))
assert {k:v for k,v in cal.items() if k not in ['nativeRowTableIds','nativeRowAuthority']}==priorCal
frozen=json.loads((D/'frozen-inputs.json').read_text());assert all(sha(Path(x['path']))==x['sha256'] for x in frozen)
paths={n:D/('SRS-'+n+'.pdf') for n in ['R0-G1-control','R1-border','R2-twips']};paths['Word']=O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'
assert sha(paths['R0-G1-control'])==sha(O/'pagination-e7/SRS-G1-table-start.pdf')
data={};draws={};sourceRows={};headings=[]
for idx,id in enumerate(body['rootIds']):
 n=m['nodes'][id]
 if n['type']=='table':
  for i,rid in enumerate(n['rowIds']):
   row=m['nodes'][rid]
   for cid in row['cellIds'][:1]:
    for b in m['nodes'][cid]['childIds']:
     for req in re.findall(r'REQ\d{4}',''.join(x.get('text','') for x in m['nodes'][b].get('children',[]))):sourceRows[req]=(id,i)
 if n['type']=='text-block' and n['props'].get('toc'):
  nxt=[m['nodes'][x] for x in body['rootIds'][idx+1:idx+3]];t=next((x for x in nxt if x['type']=='table'),None)
  if t:headings.append((id,t))
for name,path in paths.items():
 req=[];imgs=[];empty=[]
 with pdfplumber.open(path) as p:
  pages=len(p.pages)
  for pn,page in enumerate(p.pages,1):
   ls=page.extract_text_lines(return_chars=True)
   for l in ls:
    if l['top']>=775:continue
    for id in re.findall(r'REQ\d{4}',l['text']):req.append({'id':id,'page':pn,'baseline':page.height-l['chars'][0]['matrix'][5]})
   im=[{'page':pn,'srcsize':i['srcsize'],'width':i['width'],'height':i['height']} for i in page.images if i['top']>1];imgs+=im
   if not any(l['top']<775 for l in ls) and not im:empty.append(pn)
   page.close()
 data[name]={'req':req,'images':imgs,'pages':pages,'sha256':sha(path),'emptyPages':empty}
 if name!='Word':
  draw=json.loads((D/(name+'-draw.json')).read_text());runs=collections.defaultdict(list)
  for page in draw:
   for r in page['runs']:runs[r['nodeId']].append({'page':page['page'],**r})
  draws[name]=runs
 print('read',name,flush=True)
ids=[r['id'] for r in data['Word']['req']];assert len(ids)==361
for name,d in data.items():assert [r['id'] for r in d['req']]==ids and len(d['images'])==371 and [x['srcsize'] for x in d['images']]==[x['srcsize'] for x in data['Word']['images']]
common=[]
for i in range(360):
 s,t=sourceRows[ids[i]],sourceRows[ids[i+1]]
 if s[0]==t[0] and s[1]+1==t[1] and all(d['req'][i]['page']==d['req'][i+1]['page'] for d in data.values()):common.append(i)
summary={};rowPairs=[]
for i in common:
 row={'from':ids[i],'to':ids[i+1]}
 for name,d in data.items():row[name]=d['req'][i+1]['baseline']-d['req'][i]['baseline']
 rowPairs.append(row)
def metrics(v):return {'count':len(v),'meanAbsolutePt':statistics.mean(abs(x) for x in v),'meanSignedPt':statistics.mean(v),'maxAbsolutePt':max(abs(x) for x in v),'minSignedPt':min(v),'maxSignedPt':max(v)}
for name,d in data.items():
 if name=='Word':continue
 diffs=[r['Word']-r[name] for r in rowPairs]
 runs=draws[name];coverage=[]
 for id,n in m['nodes'].items():
  if n['type']!='text-block' or any(x['type'] not in ['text','line-break'] for x in n['children']):continue
  expected=re.sub(r'\s','', ''.join(x.get('text','\n') for x in n['children']))
  if not expected:continue
  actual=re.sub(r'\s','', ''.join(r['text'] for r in runs[id]));copies=len(actual)//len(expected)
  coverage.append({'id':id,'pass':copies>=1 and actual==expected*copies})
 failures=[r for r in coverage if not r['pass']];assert not failures
 split=[]
 for id,t in headings:
  hs=runs[id];children=[b for c in m['nodes'][t['rowIds'][0]]['cellIds'] for b in m['nodes'][c]['childIds']];rs=[r for b in children for r in runs[b]]
  if hs and rs and min(r['page'] for r in rs)>min(r['page'] for r in hs):split.append(id)
 reader=PdfReader(paths[name]);refs={p.indirect_reference.idnum for p in reader.pages};links=0
 for p in reader.pages:
  for a in p.get('/Annots',[]):
   a=a.get_object();action=a.get('/A',{});action=action.get_object() if hasattr(action,'get_object') else action
   dest=a.get('/Dest',action.get('/D') if action.get('/S')=='/GoTo' else None)
   if dest is not None:assert hasattr(dest[0],'idnum') and dest[0].idnum in refs;links+=1
 def sig(items):return [(r['text'],round(r['x'],6),round(r['height'],6),round(r['baseline']-r['y'],6),r['glyphCount']) for r in items]
 # Repeated headers vary in count as page cuts move; compare distinct line signatures.
 changed=[id for id in m['nodes'] if sorted(set(sig(runs[id])))!=sorted(set(sig(draws['R0-G1-control'][id])))]
 summary[name]={'pages':d['pages'],'sha256':d['sha256'],'requirements':{'count':361,'orderExact':True,'wordPageMinusPdfPage':dict(collections.Counter(w['page']-r['page'] for r,w in zip(d['req'],data['Word']['req'])))},'commonConsecutiveRows':metrics(diffs),'headingTableSeparations':split,'sourceTextCoverage':{'checked':len(coverage),'failed':failures,'scope':'Per-node plain source text modulo whitespace and exact repeated copies, not all glyph identity.'},'changedDistinctLineMetricNodes':changed,'imageCount':371,'imageSourceDimensionsOrderExact':True,'emptyPages':d['emptyPages'],'internalDestinationsInBounds':links}
render={k:pdfium.PdfDocument(str(p)) for k,p in paths.items()};raster={}
for name in ['R1-border','R2-twips']:
 changes=[];content=[];protected=[]
 for pn in range(1,100):
  a=render['R0-G1-control'][pn-1].render(scale=1).to_pil().convert('RGB');b=render[name][pn-1].render(scale=1).to_pil().convert('RGB')
  if a.tobytes()!=b.tobytes():changes.append(pn)
  if a.crop((0,0,a.width,775)).tobytes()!=b.crop((0,0,b.width,775)).tobytes():content.append(pn)
  if 11<=pn<=26:protected.append(a.tobytes()==b.tobytes())
 raster[name]={'wholePageChanged':changes,'aboveFooterChanged':content,'protected11to26WholePageExact':all(protected)}
 assert all(protected) and not summary[name]['headingTableSeparations']
out=D/'R2-pages';out.mkdir(exist_ok=True)
for pn in range(1,100):render['R2-twips'][pn-1].render(scale=1).to_pil().convert('RGB').save(out/f'{pn:03}.png')
for group in range(9):
 sheet=Image.new('RGB',(1260,1840),'#ddd');label=ImageDraw.Draw(sheet)
 for j in range(9):
  pn=27+group*9+j
  if pn>99:continue
  im=Image.open(out/f'{pn:03}.png');im.thumbnail((400,570));x=(j%3)*420;y=(j//3)*613;sheet.paste(im,(x,y+25));label.text((x+5,y+5),f'R2 physical {pn}',fill='black')
 sheet.save(D/f'overview-{group+1}.jpg')
for idx,(p,w) in enumerate([(14,14),(45,45),(46,46),(80,81),(99,100)],1):
 sheet=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(sheet)
 for col,(n,pn) in enumerate([('R2-twips',p),('Word',w)]):sheet.paste(render[n][pn-1].render(scale=1.4).to_pil().convert('RGB'),(col*834,28));label.text((col*834+8,5),f'{n} physical {pn}',fill='black')
 sheet.save(D/f'comparison-{idx}.png')
for p in render.values():p.close()
green=json.loads((D/'green-with-fixtures.json').read_text());assert green['numFailedTests']==0 and green['numPassedTests']==286
result={'authorityBoundary':'Core bounded artifact experiment, not product/default acceptance. Project Control owns shared status.','controlByteExactE7':True,'inheritedCalibrationExact':True,'frozenInputsPreserved':True,'selectedNativeRequirementTables':len(cal['nativeRowTableIds']),'factors':summary,'rowMetricScope':'Same adjacent requirement rows, consecutive in same source table, remaining on one page in all four artifacts; matched common cohort. Relative REQ-baseline interval, not complete cell/glyph equality.','raster':raster,'tests':{'passed':286,'failed':0,'initialGreenAttempt':'Fixture files omitted by test launcher; ENOENT setup failures. Complete fixture copy rerun passes.'},'footerPolicyChanged':False,'limitations':['Native Word remains100pages; outputs99. No forced page-count match.','Row stroke and text twip rounding are tested separately; inline image native paragraph footprint may retain a residual.','Whole-page native fidelity, generic fonts and merged tables are not established.']}
(D/'row-pairs.json').write_text(json.dumps(rowPairs,indent=2),encoding='utf8');(D/'comparison-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:{q:v for q,v in s.items() if q not in ['changedDistinctLineMetricNodes']} for k,s in summary.items()},indent=2))
