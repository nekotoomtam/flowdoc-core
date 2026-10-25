"""E10 frozen geometry diagnosis; never changes layout or PDF artifacts."""
from pathlib import Path
import json,re,collections,statistics,zipfile,xml.etree.ElementTree as E,hashlib,unicodedata
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e10';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
data={n:json.loads((D/(n+'-geometry.json')).read_text(encoding='utf8')) for n in ['PDF','Word']};pairs=json.loads((D/'requirement-pairs.json').read_text());groups=json.loads((D/'mismatch-groups.json').read_text());m=json.loads((O/'resolved-document.json').read_text(encoding='utf8'))
feature={};native={}
for name,d in data.items():
 out=collections.defaultdict(list);active=None
 for page in d['pages'][44:]:
  for line in page['lines']:
   reqs=re.findall(r'REQ\d{4}',line['text'])
   if reqs:active=reqs[0]
   cs=line['chars'];text=''.join(c['t'] for c in cs if 117<c['x']<457)
   if not active or not text.strip() or re.sub(r'\s','',text)=='FeaturesList':continue
   if not reqs and min(c['x'] for c in cs)<114:continue
   out[active].append({'page':page['page'],'baseline':line['baseline'],'text':text,'ascii':re.sub('[^A-Za-z0-9]','',text)})
 feature[name]=out
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx') as z:
 root=E.fromstring(z.read('word/document.xml'));styles=E.fromstring(z.read('word/styles.xml'))
 defaultWidow=list(styles.iter(W+'widowControl'))
 for row in root.iter(W+'tr'):
  cells=row.findall(W+'tc');reqs=re.findall(r'REQ\d{4}',''.join(t.text or '' for t in row.iter(W+'t')))
  if not reqs or len(cells)!=3:continue
  flags=[]
  for p in cells[1].findall(W+'p'):
   pr=p.find(W+'pPr');get=lambda k:pr.find(W+k) if pr is not None else None
   flags.append({'text':''.join(t.text or '' for t in p.iter(W+'t')),'lineBreakCount':len(list(p.iter(W+'br'))),'widowControl':None if get('widowControl') is None else get('widowControl').get(W+'val','true'),'keepNext':None if get('keepNext') is None else get('keepNext').get(W+'val','true'),'keepLines':None if get('keepLines') is None else get('keepLines').get(W+'val','true'),'drawing':bool(list(p.iter(W+'drawing')))})
  trpr=row.find(W+'trPr');cant=trpr.find(W+'cantSplit') if trpr is not None else None
  native[reqs[0]]={'paragraphs':flags,'cantSplit':None if cant is None else cant.get(W+'val','true')}
# Two authored note rows have no REQ label. They must not be counted as the
# preceding requirement paragraph or mistaken for a native widow violation.
anonymous=[];previousReq=None
for id in next(s for s in m['sections'] if s['sectionId']=='body')['rootIds']:
 t=m['nodes'][id]
 if t['type']!='table' or len(t['columns'])!=3:continue
 for rid in t['rowIds'][t['props']['headerRowCount']:]:
  cells=m['nodes'][rid]['cellIds'];texts=[''.join(x.get('text','') for b in m['nodes'][cid]['childIds'] for x in m['nodes'][b].get('children',[])) for cid in cells]
  reqs=re.findall(r'REQ\d{4}',texts[0])
  if reqs:previousReq=reqs[0]
  else:
   note={'rowId':rid,'after':previousReq,'sourceText':texts[1],'observed':{}}
   for name in ['PDF','Word']:
    last=feature[name][previousReq].pop();key=re.sub('[^A-Za-z0-9]','',texts[1])
    if key:assert last['ascii']==key
    note['observed'][name]=last
   anonymous.append(note)
assert len(anonymous)==2
diacritics=[]
for name,rows in feature.items():
 for id,ls in rows.items():
  for line in ls[:]:
   # Native extraction can place a raised Thai mark in a separate text line.
   # Retain it as a glyph fragment, never count it as a paragraph line.
   if line['text'].strip() and all(unicodedata.category(c).startswith('M') or c.isspace() for c in line['text']):
    near=[x for x in ls if x is not line and x['page']==line['page'] and abs(x['baseline']-line['baseline'])<6]
    assert near,(name,id,line)
    target=min(near,key=lambda x:abs(x['baseline']-line['baseline']))
    diacritics.append({'artifact':name,'id':id,'fragment':line,'attachedBaseline':target['baseline']});ls.remove(line)
rowMetrics=[]
for x in pairs:
 id=x['id'];a=feature['PDF'][id];b=feature['Word'][id]
 rowMetrics.append({'id':id,'pageDelta':x['delta'],'pdfTextLines':len(a),'wordTextLines':len(b),'lineCountDelta':len(b)-len(a),'asciiSequenceExact':''.join(t['ascii'] for t in a)==''.join(t['ascii'] for t in b),'pdfFragments':dict(collections.Counter(t['page'] for t in a)),'wordFragments':dict(collections.Counter(t['page'] for t in b)),'nativeFlags':native[id]})
groupDetails=[]
for group in groups:
 id=group['start']['id'];a=feature['PDF'][id];b=feature['Word'][id];pg=group['start']['pdfPage']
 groupDetails.append({'startId':id,'ids':group['ids'],'pdfPage':pg,'wordPage':group['start']['wordPage'],'pdfFirstFragmentTextLines':sum(t['page']==pg for t in a),'pdfTotalTextLines':len(a),'wordTotalTextLines':len(b),'priorId':group['preceding']['id'],'priorBaselineWordMinusPdfPt':group['preceding']['wordBaseline']-group['preceding']['pdfBaseline'],'nativeWidowControlUnspecified':all(x['widowControl'] is None for x in native[id]['paragraphs']),'nativeKeepLinesAllFalse':all(x['keepLines'] in [None,'false','0','off'] for x in native[id]['paragraphs']),'nativeRowSplittable':native[id]['cantSplit'] in [None,'false','0','off']})
fragmentInventory={}
for name in ['PDF','Word']:
 splits=[];singleton=[]
 for id,ls in feature[name].items():
  byPage=list(collections.Counter(x['page'] for x in ls).items())
  if len(byPage)>1:
   splits.append({'id':id,'fragments':byPage})
   if byPage[0][1]==1 or byPage[-1][1]==1:singleton.append({'id':id,'fragments':byPage})
 fragmentInventory[name]={'splitTextParagraphs':len(splits),'singletonEndParagraphs':singleton}
result={'authorityBoundary':'Read-only E10 cause evidence, not an implemented fix or proof of exact contribution. Project Control owns shared status.','counts':{'requirements':361,'samePage':304,'onePageEarly':57,'mismatchRunsInSourceOrder':len(groups),'runStartsWithExactlyOnePdfTextLine':sum(x['pdfFirstFragmentTextLines']==1 for x in groupDetails),'nativeDefaultStylesWidowDeclarations':len(defaultWidow),'featureLineCountDeltaDistribution':dict(collections.Counter(x['lineCountDelta'] for x in rowMetrics)),'featureAsciiSequenceExactRows':sum(x['asciiSequenceExact'] for x in rowMetrics)},'anonymousNoteRowsSeparated':anonymous,'fragmentInventory':fragmentInventory,'groupDetails':groupDetails,'rowMetrics':rowMetrics,'firstDivergence':{'id':'REQ0027','pdf':feature['PDF']['REQ0027'],'word':feature['Word']['REQ0027'],'native':native['REQ0027']},'nativeReference':'https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.widowcontrol?view=openxml-3.0.1','interpretation':['Native requirement paragraphs omit widowControl; default styles also omit it, so the standard default prevents isolated first/last lines.','PDF cell flow fits each whole measured line with padding, but has no paragraph widow/orphan check.','First REQ0027 is a two-line paragraph split1+1 by PDF but kept2 on native49. This is direct evidence of the mechanism.','Later mismatches may be propagated displacement, independent first/last-line constraints, wrapping or continuation metrics; they are not all attributed to one flag without a counterfactual.'],'candidateChanged':False,'newPdfCreated':False}
frozen=json.loads((D/'frozen-inputs.json').read_text());assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256'] for x in frozen)
result['frozenInputs']=frozen
result['separateDiacriticExtractionFragments']=diacritics
result['extractionLimitations']='Feature line counts exclude two separately extracted native Thai mark fragments and two authored anonymous note rows. ASCII equality is only a locator check and fails on some ligature/encoding extraction; it is not a text fidelity acceptance gate.'
(D/'diagnosis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');(D/'feature-lines.json').write_text(json.dumps(feature,ensure_ascii=False),encoding='utf8')
print(json.dumps({'counts':result['counts'],'groups':[{k:x[k] for k in ['startId','pdfPage','pdfFirstFragmentTextLines','pdfTotalTextLines','wordTotalTextLines','priorBaselineWordMinusPdfPt']} for x in groupDetails]},indent=2))
