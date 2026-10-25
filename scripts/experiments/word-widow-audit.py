"""E11 complete artifact audit, dynamic page counts; retained Word/E9 inputs."""
from pathlib import Path
import json,re,hashlib,collections,statistics
import pdfplumber,pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image,ImageDraw
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e11'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));cal=json.loads((D/'calibration.json').read_text(encoding='utf8'))
frozen=json.loads((D/'frozen-inputs.json').read_text());assert all(sha(Path(x['path']))==x['sha256'] for x in frozen)
assert {k:v for k,v in cal.items() if k!='nativeWidowNodeIds'}==json.loads((O/'pagination-e9/calibration.json').read_text(encoding='utf8'))
assert sha(D/'SRS-V0-E9-control.pdf')==sha(O/'pagination-e9/SRS-F1-native-bottom.pdf')
word=json.loads((O/'pagination-e10/Word-geometry.json').read_text(encoding='utf8'));old=json.loads((O/'pagination-e10/PDF-geometry.json').read_text(encoding='utf8'))
draws={n:json.loads((D/(n+'-draw.json')).read_text()) for n in ['V0-E9-control','V1-paragraph-minimum']}
runs={n:collections.defaultdict(list) for n in draws}
for name,draw in draws.items():
 for p in draw:
  for r in p['runs']:runs[name][r['nodeId']].append({'page':p['page'],**r})
candidate='V1-paragraph-minimum';geometry=[];req=[];imgs=[];empty=[]
with pdfplumber.open(D/('SRS-'+candidate+'.pdf')) as pdf:
 for pn,p in enumerate(pdf.pages,1):
  lines=[]
  for line in p.extract_text_lines(return_chars=True):
   if line['top']>=775:continue
   baseline=p.height-line['chars'][0]['matrix'][5]
   lines.append({'text':line['text'],'top':line['top'],'bottom':line['bottom']})
   for id in re.findall(r'REQ\d{4}',line['text']):req.append({'id':id,'page':pn,'baseline':baseline})
  ims=[{'srcsize':i['srcsize'],'width':i['width'],'height':i['height']} for i in p.images if i['top']>1];imgs+=ims
  if not lines and not ims:empty.append(pn)
  geometry.append({'page':pn,'lines':lines});p.close()
print('scanned',len(geometry),'pages',flush=True)
ids=[r['id'] for r in word['req']];assert [r['id'] for r in req]==ids and len(ids)==361
nativeImages=[]
with pdfplumber.open(O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf') as pdf:
 for p in pdf.pages:nativeImages += [i['srcsize'] for i in p.images if i['top']>1];p.close()
assert len(imgs)==371 and [i['srcsize'] for i in imgs]==nativeImages
assert not empty
pairs=[{'id':a['id'],'oldPdfPage':b['page'],'pdfPage':a['page'],'wordPage':w['page'],'delta':w['page']-a['page'],'baselineWordMinusPdfPt':w['baseline']-a['baseline']} for a,b,w in zip(req,old['req'],word['req'])]
coverage=[]
for id,n in m['nodes'].items():
 if n['type']!='text-block' or any(x['type'] not in ['text','line-break'] for x in n['children']):continue
 expected=re.sub(r'\s','', ''.join(x.get('text','\n') for x in n['children']))
 if not expected:continue
 actual=re.sub(r'\s','', ''.join(r['text'] for r in runs[candidate][id]));copies=len(actual)//len(expected)
 coverage.append({'id':id,'pass':copies>=1 and actual==expected*copies})
assert all(x['pass'] for x in coverage)
sig=lambda ls:sorted(set((r['text'],round(r['x'],6),round(r['height'],6),round(r['baseline']-r['y'],6),r['glyphCount']) for r in ls))
changed=[id for id in m['nodes'] if sig(runs[candidate][id])!=sig(runs['V0-E9-control'][id])]
assert changed==['section-contents~toc'],changed
body=next(s for s in m['sections'] if s['sectionId']=='body');sourceRows={};features={};headings=[]
for idx,id in enumerate(body['rootIds']):
 t=m['nodes'][id]
 if t['type']=='table':
  for i,rid in enumerate(t['rowIds']):
   cells=m['nodes'][rid]['cellIds'];first=''.join(x.get('text','') for b in m['nodes'][cells[0]]['childIds'] for x in m['nodes'][b].get('children',[]))
   for match in re.findall(r'REQ\d{4}',first):
    sourceRows[match]=(id,i);features[match]=[b for b in m['nodes'][cells[1]]['childIds'] if m['nodes'][b]['type']=='text-block']
 if t['type']=='text-block' and t['props'].get('toc'):
  nxt=next((m['nodes'][x] for x in body['rootIds'][idx+1:idx+3] if m['nodes'][x]['type']=='table'),None)
  if nxt:headings.append((id,nxt))
separations=[]
for id,t in headings:
 hs=runs[candidate][id];bs=[b for c in m['nodes'][t['rowIds'][0]]['cellIds'] for b in m['nodes'][c]['childIds']];ts=[r for b in bs for r in runs[candidate][b]]
 if hs and ts and min(r['page'] for r in ts)>min(r['page'] for r in hs):separations.append(id)
assert not separations
cohort=[]
for i in range(360):
 a,b=sourceRows[ids[i]],sourceRows[ids[i+1]]
 if a[0]==b[0] and a[1]+1==b[1] and all(ls[i]['page']==ls[i+1]['page'] for ls in [old['req'],req,word['req']]):
  before=old['req'][i+1]['baseline']-old['req'][i]['baseline'];after=req[i+1]['baseline']-req[i]['baseline'];native=word['req'][i+1]['baseline']-word['req'][i]['baseline']
  cohort.append({'from':ids[i],'to':ids[i+1],'before':before,'after':after,'Word':native})
assert all(abs(r['after']-r['before'])<1e-7 for r in cohort)
errors=[r['Word']-r['after'] for r in cohort]
fragments={};singletons=[];selectedSplits=[]
nativeFeatures=json.loads((O/'pagination-e10/feature-lines.json').read_text(encoding='utf8'))['Word']
for id,blocks in features.items():
 ls=[r for b in blocks for r in runs[candidate][b]];counter=list(collections.Counter(r['page'] for r in ls).items())
 fragments[id]={'PDF':counter,'Word':list(collections.Counter(r['page'] for r in nativeFeatures[id]).items()),'pdfTextLines':len(ls),'wordTextLines':len(nativeFeatures[id])}
for id in cal['nativeWidowNodeIds']:
 counter=list(collections.Counter(r['page'] for r in runs[candidate][id]).items())
 if len(counter)>1:
  selectedSplits.append({'nodeId':id,'fragments':counter})
  if counter[0][1]==1 or counter[-1][1]==1:singletons.append(id)
assert not singletons,singletons
reader=PdfReader(D/('SRS-'+candidate+'.pdf'));refs={p.indirect_reference.idnum for p in reader.pages};links=0
for p in reader.pages:
 for a in p.get('/Annots',[]):
  a=a.get_object();action=a.get('/A',{});action=action.get_object() if hasattr(action,'get_object') else action
  dest=a.get('/Dest',action.get('/D') if action.get('/S')=='/GoTo' else None)
  if dest is not None:assert hasattr(dest[0],'idnum') and dest[0].idnum in refs;links+=1
bodyIds={id for id,s in m['sourceMap'].items() if s.get('sectionId')=='body'}
maxBottom=max(r['y']+r['height'] for p in draws[candidate] for r in p['runs'] if r['nodeId'] in bodyIds);assert maxBottom<=cal['nativeBottom']['bodyBottomPt']+1e-6
render={n:pdfium.PdfDocument(str(p)) for n,p in {'E9':O/'pagination-e9/SRS-F1-native-bottom.pdf','V1':D/('SRS-'+candidate+'.pdf'),'Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'}.items()}
out=D/'V1-pages';out.mkdir(exist_ok=True);changedContent=[];protected=[];footerChanges=[]
for pn in range(1,len(render['V1'])+1):
 im=render['V1'][pn-1].render(scale=1).to_pil().convert('RGB');im.save(out/f'{pn:03}.png')
 if pn<=len(render['E9']):
  prev=render['E9'][pn-1].render(scale=1).to_pil().convert('RGB');same=prev.crop((0,0,prev.width,775)).tobytes()==im.crop((0,0,im.width,775)).tobytes()
  if not same:changedContent.append(pn)
  if 11<=pn<=26:protected.append(same)
  if prev.crop((0,775,prev.width,prev.height)).tobytes()!=im.crop((0,775,im.width,im.height)).tobytes():footerChanges.append(pn)
assert len(protected)==16 and all(protected)
for start in range(1,len(render['V1'])+1,12):
 sheet=Image.new('RGB',(1500,1720),'#ddd');label=ImageDraw.Draw(sheet)
 for j in range(12):
  pn=start+j
  if pn>len(render['V1']):break
  im=Image.open(out/f'{pn:03}.png');im.thumbnail((355,535));x=(j%4)*375;y=(j//4)*573;sheet.paste(im,(x,y+22));label.text((x+5,y+3),f'V1 physical {pn}',fill='black')
 sheet.save(D/f'overview-{start:03}.jpg')
for pn in [14,49,50,53,57,58,68,81,82,83,84,85,86,87,88,100]:
 sheet=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(sheet)
 for col,name in enumerate(['V1','Word']):sheet.paste(render[name][pn-1].render(scale=1.4).to_pil().convert('RGB'),(col*834,28));label.text((col*834+8,5),f'{name} physical {pn}',fill='black')
 sheet.save(D/f'comparison-{pn:03}.png')
for p in render.values():p.close()
green=json.loads((D/'green.json').read_text());red=json.loads((D/'red.json').read_text());assert green['numFailedTests']==0
result={'authorityBoundary':'Bounded E11 artifact experiment; no default rule, integration, package or general font/Word parity acceptance. Project Control owns shared status.','controlByteExactE9':True,'inheritedE9CalibrationExact':True,'selectedNativeParagraphNodes':len(cal['nativeWidowNodeIds']),'pages':{'before':len(old['pages']),'after':len(geometry),'Word':len(word['pages'])},'requirements':{'count':361,'orderExact':True,'sameWordPageBefore':sum(a['page']==b['page'] for a,b in zip(old['req'],word['req'])),'sameWordPageAfter':sum(r['delta']==0 for r in pairs),'wordPageMinusPdfPage':dict(collections.Counter(r['delta'] for r in pairs)),'remaining':[r for r in pairs if r['delta']]},'paragraphs':{'selectedSplitParagraphs':len(selectedSplits),'singletonEnds':singletons,'scope':'Count each selected text-block separately; images and anonymous rows cannot become paragraph lines.','longREQ0041':fragments['REQ0041'],'nativeExtractionCaveat':'Raw E10 per-REQ feature buckets are retained only as locators, not a fresh complete line-count parity gate. Draw includes authored blank text in REQ0006; native REQ0083 bucket includes following empty-table placeholder. Neither is a new wrapping regression.'},'sourceTextCoverage':{'checked':len(coverage),'failed':[],'scope':'Plain text nodes modulo whitespace and exact repeat copies; not complete glyph identity.'},'images':{'count':len(imgs),'sourceDimensionsOrderExact':True},'internalDestinationsInBounds':links,'headingTableSeparations':separations,'unchangedCommonRowIntervals':len(cohort),'rowIntervalErrorsPt':{'meanAbsolute':statistics.mean(abs(x) for x in errors),'maxAbsolute':max(abs(x) for x in errors)},'changedDistinctLineMetricNodes':changed,'maxBodyTextBoxBottomPt':maxBottom,'emptyPages':empty,'raster':{'pagesRendered':len(geometry),'changedContentAbove775InCommonPages':changedContent,'protected11to26ContentExact':True,'footerRasterChangedPages':footerChanges,'footerNote':'Total-page field changes99 to100; footer policy and position unchanged, whole-page pixel equality is not claimed.'},'tests':{'passed':green['numPassedTests'],'failed':0,'initialRedFailures':red['numFailedTests']},'frozenInputsPreserved':True,'frozenInputs':frozen,'limitations':['Four requirement starts remain one page early; page total equality is not full layout equality.','REQ0178 remains PDF2/native1 text lines.','Native image/paragraph and glyph parity is not proven globally; profile applies to selected frozen SRS cells.','Overview plus selected detailed page review, not every glyph at high resolution.']}
(D/'requirement-pairs.json').write_text(json.dumps(pairs,indent=2));(D/'row-pairs.json').write_text(json.dumps(cohort,indent=2));(D/'paragraph-fragments.json').write_text(json.dumps(fragments,indent=2));(D/'candidate-geometry.json').write_text(json.dumps(geometry,ensure_ascii=False),encoding='utf8');(D/'comparison-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items() if k not in ['frozenInputs','raster']},indent=2))
