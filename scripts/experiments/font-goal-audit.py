"""Outcome evidence: complete SRS paging, baseline cohorts and font controls."""
from pathlib import Path
import json,re,hashlib,collections,statistics,math
import pdfplumber,pypdfium2 as pdfium
from pypdf import PdfReader
from PIL import Image,ImageDraw
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'fidelity-goal-g1';H=O.parent/'docx-pagination-2026-10-23/fidelity-system-r13'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();read=lambda p:json.loads(p.read_text(encoding='utf8'))
frozen=read(D/'frozen-inputs.json');assert all(sha(Path(x['path']))==x['sha256'] for x in frozen)
m=read(O/'resolved-document.json');word=read(O/'pagination-e10/Word-geometry.json')['req'];ids=[x['id']for x in word]
draws={n:read(D/(n+'-draw.json'))for n in ['S0-E12-control','S1-font-baseline','S2-font-nominal','S3-scoped-font-policy']};selected='S3-scoped-font-policy';summary={};byNode={}
for n,draw in draws.items():
 runs=collections.defaultdict(list)
 for p in draw:
  for r in p['runs']:runs[r['nodeId']].append({'page':p['page'],**r})
 byNode[n]=runs;req=[{'id':r['text'],'page':p['page'],'baseline':r['baseline']}for p in draw for r in p['runs'] if re.fullmatch(r'REQ\d{4}',r['text'])];assert [x['id']for x in req]==ids
 errors=[abs(a['baseline']-b['baseline'])for a,b in zip(req,word)];summary[n]={'pages':len(draw),'sameREQStartPage':sum(a['page']==b['page']for a,b in zip(req,word)),'reqBaselineErrorPt':{'meanAbsolute':statistics.mean(errors),'p95':sorted(errors)[math.ceil(.95*len(errors))-1],'maxAbsolute':max(errors)},'sha256':sha(D/('SRS-'+n+'.pdf'))}
assert summary[selected]['pages']==100 and summary[selected]['sameREQStartPage']==361
assert summary['S0-E12-control']['sha256']==sha(O/'pagination-e12/SRS-K2-padding-half-top.pdf')
coverage=[]
for id,n in m['nodes'].items():
 if n['type']!='text-block' or any(x['type']not in ['text','line-break']for x in n['children']):continue
 expected=re.sub(r'\s','', ''.join(x.get('text','\n')for x in n['children']))
 if not expected:continue
 actual=re.sub(r'\s','', ''.join(x['text']for x in byNode[selected][id]));copies=len(actual)//len(expected);coverage.append(actual==expected*copies and copies>=1)
assert all(coverage)
def readPdf(path):
 req=[];images=[];pages=[]
 with pdfplumber.open(path)as pdf:
  for i,p in enumerate(pdf.pages,1):
   lines=p.extract_text_lines(return_chars=True);pages.append({'page':i,'lines':[{'text':l['text'],'baseline':p.height-l['chars'][0]['matrix'][5]}for l in lines if l['top']<775]})
   for l in lines:
    if l['top']<775:
     for id in re.findall(r'REQ\d{4}',l['text']):req.append((id,i))
   images += [x['srcsize']for x in p.images if x['top']>1];p.close()
 return req,images,pages
req,images,pages=readPdf(D/('SRS-'+selected+'.pdf'));nativeReq,nativeImages,_=readPdf(O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf');assert req==nativeReq and images==nativeImages and len(images)==371
reader=PdfReader(D/('SRS-'+selected+'.pdf'));refs={p.indirect_reference.idnum for p in reader.pages};links=0
for p in reader.pages:
 for a in p.get('/Annots',[]):
  a=a.get_object();act=a.get('/A',{});act=act.get_object()if hasattr(act,'get_object')else act;dest=a.get('/Dest',act.get('/D')if act.get('/S')=='/GoTo'else None)
  if dest is not None:assert dest[0].idnum in refs;links+=1
matrix=[]
for packet in read(D/'matrix-admission.json'):
 name=packet['packet'];d=read(D/'matrix'/(name+'-draw.json'));inputModel=read(H/packet['input']);caseNodes={id:''.join(x.get('text','\n')for x in n['children']).replace(' ','')for id,n in inputModel['nodes'].items()if n['type']=='text-block' and ''.join(x.get('text','')for x in n['children']).startswith('CASE ')}
 chars=[]
 with pdfplumber.open(packet['nativePdf'])as pdf:
  nativePages=len(pdf.pages)
  for pg in pdf.pages:
   chars.extend({'text':c['text'],'baseline':pg.height-c['matrix'][5]}for c in pg.chars if not c['text'].isspace());pg.close()
 text=''.join(x['text']for x in chars);start=[];cursor=0
 for c in chars:start.append(cursor);cursor+=len(c['text'])
 import bisect
 errors=[];cases=[]
 for id,key in caseNodes.items():
  rs=[r for p in d for r in p['runs']if r['nodeId']==id];assert ''.join(r['text']for r in rs).replace(' ','')==key
  at=text.find(key);assert at>=0 and text.find(key,at+1)<0,(name,key)
  baseline=chars[bisect.bisect_right(start,at)-1]['baseline'];delta=rs[0]['baseline']-baseline;errors.append(abs(delta));cases.append({'id':id,'case':key,'baselineDeltaPt':delta,'nativeAtLeastSelected':id in packet['selectedNativeAtLeastNodeIds']})
 matrix.append({'packet':name,'pdfPages':len(d),'nativePages':nativePages,'markerOrigins':len(cases),'meanAbsBaselinePt':statistics.mean(errors),'maxAbsBaselinePt':max(errors),'cases':cases,'identityBasis':packet['identityBasis']})
 print(name,len(cases),max(errors),flush=True)
render={n:pdfium.PdfDocument(str(p))for n,p in {'E12':O/'pagination-e12/SRS-K2-padding-half-top.pdf','S3':D/('SRS-'+selected+'.pdf'),'Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'}.items()};out=D/'S3-pages';out.mkdir(exist_ok=True);protected=[];footer=[]
for pn in range(1,101):
 a=render['E12'][pn-1].render(scale=1).to_pil().convert('RGB');b=render['S3'][pn-1].render(scale=1).to_pil().convert('RGB');b.save(out/f'{pn:03}.png')
 if 11<=pn<=26:protected.append(a.tobytes()==b.tobytes())
 if a.crop((0,775,a.width,a.height)).tobytes()!=b.crop((0,775,b.width,b.height)).tobytes():footer.append(pn)
assert all(protected) and not footer
for start in range(1,101,12):
 im=Image.new('RGB',(1500,1720),'#ddd');label=ImageDraw.Draw(im)
 for j in range(12):
  pn=start+j
  if pn>100:break
  pic=Image.open(out/f'{pn:03}.png');pic.thumbnail((355,535));x=j%4*375;y=j//4*573;im.paste(pic,(x,y+22));label.text((x+5,y+3),f'S3 page{pn}',fill='black')
 im.save(D/f'overview-{start:03}.jpg')
for pn in [49,53,68,69,82,86,88,100]:
 im=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(im)
 for col,name in enumerate(['S3','Word']):im.paste(render[name][pn-1].render(scale=1.4).to_pil().convert('RGB'),(834*col,28));label.text((834*col+8,5),name+' page'+str(pn),fill='black')
 im.save(D/f'comparison-{pn:03}.png')
for p in render.values():p.close()
green=read(D/'green-final.json');assert green['numFailedTests']==0
r={'authorityBoundary':'Outcome experiment only. Project Control owns acceptance. Native font marker origins do not prove complete shaping/wrapping/glyph similarity.','selectedFactor':selected,'factors':summary,'sourceTextCoverage':{'checked':len(coverage),'failed':0,'scope':'Plain text modulo whitespace and repeats.'},'images':{'count':371,'nativeSourceDimensionsOrderExact':True},'internalTargetPagesExist':links,'preservation':{'E12ControlByteExact':True,'protected11to26WholePagesExact':True,'footerRasterChanged':footer},'fontControls':matrix,'fontControlScope':'96 CASE marker baseline origins across2families,4faces,3sizes. AtLeast paragraphs selected by frozen native XML. Not complete body glyph/line membership acceptance. Some historical native files lack original native hash record in their provenance report; freshly pinned controls are not silently relabelled current Word conversions.','tests':{'passed':green['numPassedTests'],'failed':0},'frozenInputs':frozen,'goalStatus':'IMPROVED, NOT COMPLETE GENERAL FIDELITY ACCEPTANCE','limitations':['Remaining SRS baseline errors and layout geometry need full text/glyph alignment accounting; REQ baseline origins alone are not all letters.','No new Word conversion; font-control paragraph/line differences and exact/source-guided paths are outside origin-only comparison.','Nominal ASCII retains ligature/complex-script shaping and is an experiment, not a general native kerning rule.']}
(D/'comparison-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');(D/'candidate-pages.json').write_text(json.dumps(pages,ensure_ascii=False),encoding='utf8');print(json.dumps({'SRS':summary[selected],'fontMarkerCount':sum(x['markerOrigins']for x in matrix),'tests':r['tests']},indent=2))
