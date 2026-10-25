"""E12 full-source audit of rejected top factors and retained padding/top factor."""
from pathlib import Path
import json,re,hashlib,collections,statistics,zipfile,xml.etree.ElementTree as E
import pdfplumber,pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image,ImageDraw
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e12'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));cal=json.loads((D/'calibration.json').read_text(encoding='utf8'))
frozen=json.loads((D/'frozen-inputs.json').read_text());assert all(sha(Path(x['path']))==x['sha256'] for x in frozen)
assert {k:v for k,v in cal.items() if k!='nativeBodyStart'}==json.loads((O/'pagination-e11/calibration.json').read_text(encoding='utf8'))
word=json.loads((O/'pagination-e10/Word-geometry.json').read_text(encoding='utf8'));priorPairs=json.loads((O/'pagination-e11/requirement-pairs.json').read_text());ids=[r['id'] for r in word['req']];assert len(ids)==361
names=['T0-E11-control','T1-native-top','T2-top-stroke','T3-top-half-stroke','K1-padding-cut','K2-padding-half-top'];candidate=names[-1]
draws={n:json.loads((D/(n+'-draw.json')).read_text()) for n in names};runs={n:collections.defaultdict(list) for n in names}
factors={};allReq={}
for name,draw in draws.items():
 for p in draw:
  for r in p['runs']:runs[name][r['nodeId']].append({'page':p['page'],**r})
 req=[{'id':r['text'],'page':p['page'],'baseline':r['baseline']} for p in draw for r in p['runs'] if re.fullmatch(r'REQ\d{4}',r['text'])]
 assert [r['id'] for r in req]==ids;allReq[name]=req
 pairs=[{'id':a['id'],'pdfPage':a['page'],'wordPage':b['page'],'delta':b['page']-a['page'],'baselineWordMinusPdfPt':b['baseline']-a['baseline']} for a,b in zip(req,word['req'])]
 regressions=[r['id'] for r,old in zip(pairs,priorPairs) if old['delta']==0 and r['delta']!=0]
 factors[name]={'pages':len(draw),'sha256':sha(D/('SRS-'+name+'.pdf')),'requirements':{'sameWordPage':sum(r['delta']==0 for r in pairs),'remaining':[r for r in pairs if r['delta']],'regressionsAgainstE11':regressions},'disposition':'selected' if name==candidate else 'control' if name==names[0] else 'not selected'}
assert factors[names[0]]['sha256']==sha(O/'pagination-e11/SRS-V1-paragraph-minimum.pdf')
assert factors[candidate]['pages']==100 and factors[candidate]['requirements']['sameWordPage']==361 and not factors[candidate]['requirements']['regressionsAgainstE11']
geometry=[];pdfReq=[];images=[];empty=[]
with pdfplumber.open(D/('SRS-'+candidate+'.pdf')) as pdf:
 for pn,p in enumerate(pdf.pages,1):
  lines=[]
  for line in p.extract_text_lines(return_chars=True):
   if line['top']>=775:continue
   chars=[{'t':c['text'],'x':c['x0'],'baseline':p.height-c['matrix'][5]} for c in line['chars']];baseline=chars[0]['baseline']
   lines.append({'text':line['text'],'baseline':baseline,'chars':chars})
   for id in re.findall(r'REQ\d{4}',line['text']):pdfReq.append({'id':id,'page':pn,'baseline':baseline})
  ims=[{'srcsize':i['srcsize'],'width':i['width'],'height':i['height']} for i in p.images if i['top']>1];images+=ims
  if not lines and not ims:empty.append(pn)
  geometry.append({'page':pn,'lines':lines});p.close()
assert [r['id'] for r in pdfReq]==ids and all(a['page']==b['page'] for a,b in zip(pdfReq,word['req']))
nativeImages=[]
with pdfplumber.open(O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf') as pdf:
 for p in pdf.pages:nativeImages += [i['srcsize'] for i in p.images if i['top']>1];p.close()
assert len(images)==371 and [i['srcsize'] for i in images]==nativeImages and not empty
coverage=[]
for id,n in m['nodes'].items():
 if n['type']!='text-block' or any(x['type'] not in ['text','line-break'] for x in n['children']):continue
 expected=re.sub(r'\s','', ''.join(x.get('text','\n') for x in n['children']))
 if not expected:continue
 actual=re.sub(r'\s','', ''.join(r['text'] for r in runs[candidate][id]));copies=len(actual)//len(expected)
 coverage.append({'id':id,'pass':copies>=1 and actual==expected*copies})
assert all(x['pass'] for x in coverage)
sig=lambda rs:sorted(set((r['text'],round(r['x'],6),round(r['height'],6),round(r['baseline']-r['y'],6),r['glyphCount']) for r in rs))
changed=[id for id in m['nodes'] if sig(runs[candidate][id])!=sig(runs[names[0]][id])];assert changed==['section-contents~toc']
splits=[];singletons=[]
for id in cal['nativeWidowNodeIds']:
 counts=list(collections.Counter(r['page'] for r in runs[candidate][id]).items())
 if len(counts)>1:
  splits.append({'nodeId':id,'fragments':counts})
  if counts[0][1]==1 or counts[-1][1]==1:singletons.append(id)
assert not singletons
body=next(s for s in m['sections'] if s['sectionId']=='body');sourceRows={};features={};headings=[]
for idx,id in enumerate(body['rootIds']):
 t=m['nodes'][id]
 if t['type']=='table':
  for i,rid in enumerate(t['rowIds']):
   cells=m['nodes'][rid]['cellIds'];first=''.join(x.get('text','') for b in m['nodes'][cells[0]]['childIds'] for x in m['nodes'][b].get('children',[]))
   for match in re.findall(r'REQ\d{4}',first):sourceRows[match]=(id,i);features[match]=[b for b in m['nodes'][cells[1]]['childIds'] if m['nodes'][b]['type']=='text-block']
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
 if a[0]==b[0] and a[1]+1==b[1] and all(rs[i]['page']==rs[i+1]['page'] for rs in [allReq[names[0]],allReq[candidate],word['req']]):
  vals={name:allReq[name][i+1]['baseline']-allReq[name][i]['baseline'] for name in [names[0],candidate]};vals['Word']=word['req'][i+1]['baseline']-word['req'][i]['baseline'];cohort.append({'from':ids[i],'to':ids[i+1],**vals})
assert all(abs(r[candidate]-r[names[0]])<1e-7 for r in cohort)
errors=[r['Word']-r[candidate] for r in cohort]
reader=PdfReader(D/('SRS-'+candidate+'.pdf'));refs={p.indirect_reference.idnum for p in reader.pages};links=0
for p in reader.pages:
 for a in p.get('/Annots',[]):
  a=a.get_object();action=a.get('/A',{});action=action.get_object() if hasattr(action,'get_object') else action;dest=a.get('/Dest',action.get('/D') if action.get('/S')=='/GoTo' else None)
  if dest is not None:assert hasattr(dest[0],'idnum') and dest[0].idnum in refs;links+=1
bodyIds={id for id,s in m['sourceMap'].items() if s.get('sectionId')=='body'};maxBottom=max(r['y']+r['height'] for p in draws[candidate] for r in p['runs'] if r['nodeId'] in bodyIds);assert maxBottom<=cal['nativeBottom']['bodyBottomPt']+1e-6
render={n:pdfium.PdfDocument(str(p)) for n,p in {'E11':O/'pagination-e11/SRS-V1-paragraph-minimum.pdf','K2':D/('SRS-'+candidate+'.pdf'),'Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'}.items()};assert all(len(p)==100 for p in render.values())
out=D/'K2-pages';out.mkdir(exist_ok=True);contentChanges=[];footerChanges=[];protected=[];bandChanges=[]
for pn in range(1,101):
 a=render['E11'][pn-1].render(scale=1).to_pil().convert('RGB');b=render['K2'][pn-1].render(scale=1).to_pil().convert('RGB');b.save(out/f'{pn:03}.png')
 same=a.crop((0,0,a.width,775)).tobytes()==b.crop((0,0,b.width,775)).tobytes()
 if not same:contentChanges.append(pn)
 if 11<=pn<=26:protected.append(same)
 if a.crop((0,775,a.width,a.height)).tobytes()!=b.crop((0,775,b.width,b.height)).tobytes():footerChanges.append(pn)
 if a.crop((0,0,a.width,77)).tobytes()!=b.crop((0,0,b.width,77)).tobytes():bandChanges.append(pn)
assert all(protected) and not footerChanges and not bandChanges
for start in range(1,101,12):
 sheet=Image.new('RGB',(1500,1720),'#ddd');label=ImageDraw.Draw(sheet)
 for j in range(12):
  pn=start+j
  if pn>100:break
  im=Image.open(out/f'{pn:03}.png');im.thumbnail((355,535));x=(j%4)*375;y=(j//4)*573;sheet.paste(im,(x,y+22));label.text((x+5,y+3),f'K2 physical {pn}',fill='black')
 sheet.save(D/f'overview-{start:03}.jpg')
for pn in [14,49,53,68,81,82,83,84,85,86,87,88,100]:
 sheet=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(sheet)
 for col,name in enumerate(['K2','Word']):sheet.paste(render[name][pn-1].render(scale=1.4).to_pil().convert('RGB'),(col*834,28));label.text((col*834+8,5),f'{name} physical {pn}',fill='black')
 sheet.save(D/f'comparison-{pn:03}.png')
for p in render.values():p.close()
fragments=lambda name,id:list(collections.Counter(r['page'] for b in features[id] for r in runs[name][b]).items())
old={x['id']:x for x in priorPairs};remainingIds=[x['id'] for x in priorPairs if x['delta']]
diagnosis={'fourOriginalResiduals':[{'id':id,'before':old[id],'after':allReq[candidate][ids.index(id)],'Word':word['req'][ids.index(id)]} for id in remainingIds],'causalFactors':'Top81 alone does not resolve starts. Full/half-stroke top with E11 old cut introduces18 previously aligned starts moving late. Fixing padding cut alone keeps357 starts. Correct cut plus source-derived81+.5/2 top gives361. No arbitrary REQ-specific keep rules.','paddingBug':'Old cut nextLineStart-topPadding excludes previous retained line plus bottom padding; subsequent whole-line carry moves one extra line. Correct cut nextLineStart+bottomPadding preserves the retained line and moves only intended suffix.','nativeTopSource':cal['nativeBodyStart'],'nativeFirstHeaderTextBoxTopPt':84.5,'candidateFirstHeaderTextBoxTopPt':next(r['y'] for r in draws[candidate][80]['runs'] if r['text']=='Req no.'),'note':'Native first header text box84.5pt comes from retained native geometry edges; native baseline differs by font metric and is not claimed exact.'}
green=json.loads((D/'green-padding.json').read_text());red=json.loads((D/'red-padding.json').read_text());assert green['numFailedTests']==0 and red['numFailedTests']>=1
result={'authorityBoundary':'Bounded E12 frozen SRS experiment, not product/default/package/general-font parity acceptance. Project Control owns shared status.','selectedFactor':candidate,'factors':factors,'controlByteExactE11':True,'inheritedE11CalibrationExact':True,'pages':{'after':100,'Word':100},'sourceTextCoverage':{'checked':len(coverage),'failed':[],'scope':'Plain text modulo whitespace and repeated copies, not complete glyph identity.'},'images':{'count':len(images),'sourceDimensionsOrderExact':True},'internalTargetPagesExist':links,'headingTableSeparations':separations,'unchangedCommonRowIntervals':len(cohort),'nativeRowIntervalErrorsPt':{'meanAbsolute':statistics.mean(abs(x) for x in errors),'maxAbsolute':max(abs(x) for x in errors)},'changedDistinctDrawLineSignatureNodes':changed,'paragraphs':{'selectedNodes':len(cal['nativeWidowNodeIds']),'split':len(splits),'singletonEnds':singletons,'REQ0041':fragments(candidate,'REQ0041')},'maxBodyTextBoxBottomPt':maxBottom,'raster':{'pagesRendered':100,'contentChangedAbove775':contentChanges,'protected11to26ContentExact':True,'footerChangedPages':footerChanges,'headerBandChangedPages':bandChanges},'emptyPages':empty,'tests':{'passed':green['numPassedTests'],'failed':0,'redFailures':red['numFailedTests']},'diagnosis':diagnosis,'frozenInputsPreserved':True,'frozenInputs':frozen,'limitations':['361 matching start pages does not establish all paragraph split points, glyph/baseline/image geometry or complete page similarity.','REQ0178 wrapping difference and body font-baseline offset remain separate.','Existing heading+minimum oversize preflight/rowGroups/merged cells/general fonts remain outside bounded scope.']}
(D/'comparison-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');(D/'candidate-geometry.json').write_text(json.dumps(geometry,ensure_ascii=False),encoding='utf8');(D/'row-pairs.json').write_text(json.dumps(cohort,indent=2));(D/'diagnosis.json').write_text(json.dumps(diagnosis,indent=2));(D/'paragraph-splits.json').write_text(json.dumps(splits,indent=2))
print(json.dumps({k:v for k,v in result.items() if k not in ['factors','frozenInputs','diagnosis','raster']},indent=2))
