from pathlib import Path
import json,re,hashlib,collections,statistics
import pdfplumber,pypdfium2 as pdfium
from PIL import Image,ImageDraw
O=Path(r'C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e7';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths={'M2':O/'spacing-e5/SRS-M2-boundary.pdf','G1':D/'SRS-G1-table-start.pdf','Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'}
model=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));body=next(s for s in model['sections']if s['sectionId']=='body');data={};inputs={}
for name,path in paths.items():
 req=[];images=[];lines=[];index={};empty=[]
 with pdfplumber.open(path)as pdf:
  inputs[name]={'path':str(path),'sha256':sha(path),'pages':len(pdf.pages),'bytes':path.stat().st_size}
  for pn,p in enumerate(pdf.pages,1):
   ls=p.extract_text_lines(return_chars=True);bodyLines=[]
   for l in ls:
    if l['top']>=775:continue
    r={'text':l['text'],'page':pn,'baseline':p.height-l['chars'][0]['matrix'][5],'key':re.sub('[^A-Za-z0-9]','',l['text'])};lines.append(r);bodyLines.append(r)
    if pn>=27:index.setdefault(r['key'],[]).append(r)
    for id in re.findall(r'REQ\d{4}',l['text']):req.append({'id':id,**r})
   imgs=[{'page':pn,'srcsize':i['srcsize'],'height':i['height'],'width':i['width']}for i in p.images if i['top']>1];images+=imgs
   if not bodyLines and not imgs:empty.append(pn)
   p.close()
 data[name]={'req':req,'images':images,'lines':lines,'index':index,'empty':empty};print('read',name,flush=True)
draws={name:json.loads((D/(mode+'-draw.json')).read_text())for name,mode in [('M2','G0-M2-control'),('G1','G1-table-start')]}
runs={}
for name,draw in draws.items():
 r=collections.defaultdict(list)
 for page in draw:
  for run in page['runs']:r[run['nodeId']].append({'page':page['page'],**run})
 runs[name]=r
def metric_set(items):return sorted(set((r['text'],round(r['x'],6),round(r['height'],6),round(r['baseline']-r['y'],6),r['glyphCount'])for r in items))
metric_changes=[id for id in model['nodes']if metric_set(runs['M2'][id])!=metric_set(runs['G1'][id])]
coverage=[]
for id,n in model['nodes'].items():
 if n['type']!='text-block'or any(c['type']not in ['text','line-break']for c in n['children']):continue
 expected=re.sub(r'\s','', ''.join(c.get('text','\n')for c in n['children']))
 if not expected:continue
 actual=re.sub(r'\s','', ''.join(r['text']for r in runs['G1'][id]));copies=len(actual)//len(expected)
 coverage.append({'id':id,'pass':copies>=1 and actual==expected*copies,'copies':copies})
orphans={};headings=[]
for i,id in enumerate(body['rootIds']):
 n=model['nodes'][id]
 if n['type']!='text-block'or not n['props'].get('toc'):continue
 text=''.join(c.get('text','')for c in n['children']);key=re.sub('[^A-Za-z0-9]','',text);following=body['rootIds'][i+1:i+3];t=next((model['nodes'][x]for x in following if model['nodes'][x]['type']=='table'),None)
 row={'id':id,'text':text}
 for name in ['M2','G1','Word']:
  found=data[name]['index'].get(key,[]);row[name+'Page']=found[0]['page']if len(found)==1 else None
 if t:
  cells=model['nodes'][t['rowIds'][0]]['cellIds'];ids=[c for cell in cells for c in model['nodes'][cell]['childIds']]
  for name in ['M2','G1']:
   first=min((r['page']for child in ids for r in runs[name][child]),default=None);row[name+'TablePage']=first
   if first and row[name+'Page']and first>row[name+'Page']:orphans.setdefault(name,[]).append(row.copy())
 headings.append(row)
req_stats={}
for name in ['M2','G1']:
 a=data[name]['req'];b=data['Word']['req'];assert len(a)==len(b)==361 and[x['id']for x in a]==[x['id']for x in b]
 req_stats[name]={'count':361,'orderExact':True,'pageDeltaCounts':dict(collections.Counter(y['page']-x['page']for x,y in zip(a,b)))}
native_images=data['Word']['images'];candidate_images=data['G1']['images'];assert len(native_images)==len(candidate_images)==371
render={n:pdfium.PdfDocument(str(p))for n,p in paths.items()};first26={};strict=[]
for pn in range(1,27):
 a=render['M2'][pn-1].render(scale=1).to_pil().convert('RGB');b=render['G1'][pn-1].render(scale=1).to_pil().convert('RGB')
 first26[str(pn)]={'wholePageExact':a.tobytes()==b.tobytes(),'aboveFooterExact':a.crop((0,0,a.width,775)).tobytes()==b.crop((0,0,b.width,775)).tobytes()}
 if not first26[str(pn)]['wholePageExact']:strict.append(pn)
out=D/'G1-pages';out.mkdir(exist_ok=True)
for pn in range(1,100):render['G1'][pn-1].render(scale=1).to_pil().convert('RGB').save(out/f'{pn:03}.png')
for group in range(9):
 sheet=Image.new('RGB',(1260,1840),'#ddd');label=ImageDraw.Draw(sheet)
 for j in range(9):
  pn=27+group*9+j
  if pn>99:continue
  im=Image.open(out/f'{pn:03}.png');im.thumbnail((400,570));x=(j%3)*420;y=(j//3)*613;sheet.paste(im,(x,y+25));label.text((x+5,y+5),f'G1 page {pn}',fill='black')
 sheet.save(D/f'overview-{group+1}.jpg')
for i,(p,w)in enumerate([(27,27),(28,28),(45,45),(46,46),(80,81),(99,100)],1):
 sheet=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(sheet)
 for col,(name,pn)in enumerate([('G1',p),('Word',w)]):sheet.paste(render[name][pn-1].render(scale=1.4).to_pil().convert('RGB'),(834*col,28));label.text((834*col+8,5),f'{name} physical {pn}',fill='black')
 sheet.save(D/f'comparison-{i}.png')
for p in render.values():p.close()
frozen=json.loads((D/'frozen-inputs.json').read_text());assert all(sha(Path(x['path']))==x['sha256']for x in frozen)
assert sha(D/'SRS-G0-M2-control.pdf')==inputs['M2']['sha256']
green=json.loads((D/'green.json').read_text());failures=[x for x in coverage if not x['pass']]
result={'authorityBoundary':'Core experiment only; Project Control owns shared status. No merge or general Word rule.','inputs':inputs,'controlByteExact':True,'tests':{'passed':green['numPassedTests'],'failed':green['numFailedTests']},'requirements':req_stats,'headingTableSeparations':{'M2':len(orphans.get('M2',[])),'G1':len(orphans.get('G1',[])),'remaining':orphans.get('G1',[])},'first26Pages':first26,'strictWholePageChangedInFirst26':strict,'page14ContentExact':first26['14']['aboveFooterExact'],'meetingContentExact':all(first26[str(p)]['aboveFooterExact']for p in range(17,27)),'sourceLineMetricsChanges':metric_changes,'sourcePlainTextCoverage':{'checked':len(coverage),'failed':failures,'scope':'Per-node source text modulo whitespace and repeated exact copies, not full glyph identity.'},'imageSourceDimensionsOrderExact':[x['srcsize']for x in candidate_images]==[x['srcsize']for x in native_images],'emptyPages':data['G1']['empty'],'rowAndFooterPolicyChanged':False,'frozenInputsPreserved':True,'headings':headings,'limitations':['Totals update98->99 in footers, so strict whole-page pixel equality fails there. Content-region equality is separate evidence.','TOC page references may update with body pagination.','Other row/footer footprint differences are intentionally not changed.']}
(D/'comparison-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8');(D/'source-text-coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items()if k not in ['headings','first26Pages','inputs']},ensure_ascii=False,indent=2))
