"""Read-only diagnosis of the frozen98/100page artifacts; no layout mutation."""
from pathlib import Path
import json,re,hashlib,statistics,collections,zipfile,xml.etree.ElementTree as E
import pdfplumber,pypdfium2 as pdfium
from PIL import Image,ImageDraw
O=Path(r'C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e6';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths={'PDF':O/'spacing-e5/SRS-M2-boundary.pdf','Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'}
model=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));section=next(s for s in model['sections']if s['sectionId']=='body')
source_rows={};heading_nodes=[]
for i,id in enumerate(section['rootIds']):
 n=model['nodes'][id]
 if n['type']=='table':
  for ri,rid in enumerate(n['rowIds']):
   row=model['nodes'][rid]
   for cid in row['cellIds'][:1]:
    for child in model['nodes'][cid]['childIds']:
     ch=model['nodes'][child];text=''.join(t.get('text','')for t in ch.get('children',[]))
     for req in re.findall(r'REQ\d{4}',text):source_rows[req]={'tableId':id,'rowIndex':ri,'rowId':rid}
 if n['type']=='text-block'and n['props'].get('toc'):
  text=''.join(t.get('text','')for t in n['children']);following=section['rootIds'][i+1:i+3];table=next((model['nodes'][x]for x in following if model['nodes'][x]['type']=='table'),None)
  heading_nodes.append({'nodeId':id,'text':text,'key':re.sub('[^A-Za-z0-9]','',text),'tableId':table['id']if table else None})
data={};inventory={}
for name,path in paths.items():
 req=[];images=[];lines=[];keys={}
 with pdfplumber.open(path)as pdf:
  inventory[name]={'path':str(path),'sha256':sha(path),'pages':len(pdf.pages),'bytes':path.stat().st_size}
  for pn,p in enumerate(pdf.pages,1):
   for l in p.extract_text_lines(return_chars=True):
    r={'page':pn,'baseline':p.height-l['chars'][0]['matrix'][5],'top':l['top'],'bottom':l['bottom'],'text':l['text'],'key':re.sub('[^A-Za-z0-9]','',l['text'])}
    if l['top']<775:
     lines.append(r)
     if pn>=27:keys.setdefault(r['key'],[]).append(r)
    for rid in re.findall('REQ[0-9]{4}',l['text']):req.append({'id':rid,**r})
   images.extend({'page':pn,'top':i['top'],'height':i['height'],'width':i['width'],'srcsize':i['srcsize']}for i in p.images if i['top']>1)
   p.close()
  data[name]={'req':req,'images':images,'lines':lines,'keys':keys}
 print('read',name,flush=True)
a=data['PDF']['req'];b=data['Word']['req'];assert len(a)==len(b)==361 and[x['id']for x in a]==[x['id']for x in b]
req_pairs=[{'id':x['id'],'pdfPage':x['page'],'wordPage':y['page'],'pdfBaseline':x['baseline'],'wordBaseline':y['baseline'],'pageDelta':y['page']-x['page']}for x,y in zip(a,b)]
row_pairs=[]
for i in range(len(a)-1):
 x,y=a[i:i+2];u,v=b[i:i+2];sx=source_rows[x['id']];sy=source_rows[y['id']]
 if x['page']==y['page']and u['page']==v['page']and sx['tableId']==sy['tableId']and sy['rowIndex']==sx['rowIndex']+1:
  ph=y['baseline']-x['baseline'];wh=v['baseline']-u['baseline'];row_pairs.append({'from':x['id'],'to':y['id'],'pdfHeightPt':ph,'wordHeightPt':wh,'wordExtraPt':wh-ph})
draw=json.loads((O/'spacing-e5/M2-boundary-draw.json').read_text());runs=collections.defaultdict(list)
for page in draw:
 for r in page['runs']:runs[r['nodeId']].append({'page':page['page'],**r})
headings=[];orphan=[]
for h in heading_nodes:
 x=data['PDF']['keys'].get(h['key'],[]);y=data['Word']['keys'].get(h['key'],[])
 if len(x)!=1 or len(y)!=1:continue
 record={**h,'pdfPage':x[0]['page'],'pdfBaseline':x[0]['baseline'],'wordPage':y[0]['page'],'wordBaseline':y[0]['baseline'],'pageDelta':y[0]['page']-x[0]['page']}
 if h['tableId']:
  t=model['nodes'][h['tableId']];row=model['nodes'][t['rowIds'][0]];ids=[child for cid in row['cellIds']for child in model['nodes'][cid]['childIds']]
  first=min((r['page']for id in ids for r in runs[id]),default=None);record['pdfFollowingTableFirstHeaderPage']=first
  candidates=[l for l in data['Word']['lines']if 'FeaturesList'in l['key']and(l['page']>y[0]['page']or l['page']==y[0]['page']and l['baseline']>y[0]['baseline'])]
  record['wordFollowingTableHeaderPage']=candidates[0]['page']if candidates else None
  if first and first>x[0]['page']:orphan.append(record)
 headings.append(record)
ip=data['PDF']['images'];iw=data['Word']['images'];assert len(ip)==len(iw)==371
assert[x['srcsize']for x in ip]==[x['srcsize']for x in iw]
height_deltas=[y['height']-x['height']for x,y in zip(ip,iw)]
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx')as z:
 root=E.fromstring(z.read('word/document.xml'));native_body=list(root.find(W+'body'));sect=list(root.iter(W+'sectPr'))[-1];pg=sect.find(W+'pgSz');m=sect.find(W+'pgMar')
 native_geometry={'heightPt':int(pg.get(W+'h'))/20,'topPt':int(m.get(W+'top'))/20,'bottomMarginPt':int(m.get(W+'bottom'))/20,'bottomPt':(int(pg.get(W+'h'))-int(m.get(W+'bottom')))/20}
 heading_flags=[]
 native_req1={}
 for t in root.findall(W+'body/'+W+'tbl'):
  rows=t.findall(W+'tr');match=next((r for r in rows if 'REQ0001'in ''.join(x.text or''for x in r.iter(W+'t'))),None)
  if match is None:continue
  c=match.find(W+'tc');mar=c.find(W+'tcPr/'+W+'tcMar');border=t.find(W+'tblPr/'+W+'tblBorders/'+W+'bottom')
  native_req1={'topPaddingPt':int(mar.find(W+'top').get(W+'w'))/20,'bottomPaddingPt':int(mar.find(W+'bottom').get(W+'w'))/20,'borderPt':int(border.get(W+'sz'))/8};break
 for p in native_body:
  if p.tag!=W+'p':continue
  pp=p.find(W+'pPr')
  if pp is not None and pp.find(W+'outlineLvl')is not None:
   kn=pp.find(W+'keepNext');kl=pp.find(W+'keepLines');heading_flags.append({'text':''.join(t.text or''for t in p.iter(W+'t')),'keepNext':kn is not None and kn.get(W+'val')!='false','keepLines':kl is not None and kl.get(W+'val')!='false'})
footer=section['footer'];offset=footer['placement']['offset'];pt=lambda v:v['value']*(72/25.4 if v['unit']=='mm'else 1)
# This frozen footer is compact17pt + rule(1+.5+3) + columns17pt.
assert len(footer['rootIds'])==3
pdf_height=297*72/25.4;pdf_bottom=pdf_height-pt(offset)-38.5-pt(footer['gap'])
capacity={'PDF':{'heightPt':pdf_height,'topPt':24.324324324324323*72/25.4+12,'bottomPt':pdf_bottom,'footerHeightPt':38.5},'Word':native_geometry,'wordUsableBottomEarlierPt':pdf_bottom-native_geometry['bottomPt'],'note':'PDF footer height follows this frozen compact/rule/columns source; native margins from actual D XML. Not a generic footer formula.'}
for n in ['PDF','Word']:capacity[n]['bodyHeightPt']=capacity[n]['bottomPt']-capacity[n]['topPt']
image_first=[next(i for i,x in enumerate(ip)if x['page']>=27)]
frozen=[]
for p in [*paths.values(),O/'spacing-e3/SRS-spacing-D-cell-baseline.docx',O/'inputs/original-reference.pdf',O/'resolved-document.json',O/'spacing-e5/M2-boundary-draw.json']:
 frozen.append({'path':str(p),'sha256':sha(p),'bytes':p.stat().st_size})
render={k:pdfium.PdfDocument(str(p))for k,p in paths.items()}
pairs=[(27,27),(28,28),(45,45),(75,76),(80,82),(98,100)]
for i,(p,w)in enumerate(pairs,1):
 sheet=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(sheet)
 for col,(n,pn)in enumerate([('PDF',p),('Word',w)]):
  im=render[n][pn-1].render(scale=1.4).to_pil().convert('RGB');sheet.paste(im,(col*834,28));label.text((col*834+10,5),f'{n} physical {pn}',fill='black')
 sheet.save(D/f'comparison-{i}.png')
for p in render.values():p.close()
ds=[r['wordExtraPt']for r in row_pairs]
result={'authorityBoundary':'Read-only cause investigation, not a renderer repair or compatibility acceptance. Project Control owns shared status.','inputs':inventory,'frozenInputs':frozen,'requirements':{'count':361,'orderExact':True,'pageDeltaCounts':dict(collections.Counter(r['pageDelta']for r in req_pairs)),'firstPageDelta1':next(r for r in req_pairs if r['pageDelta']==1),'firstPageDelta2':next(r for r in req_pairs if r['pageDelta']==2),'pairs':req_pairs},'headings':headings,'pdfHeadingsSeparatedFromFollowingTableHeader':orphan,'consecutiveSameTableRowsOnSamePages':{'count':len(ds),'meanWordExtraPt':statistics.mean(ds),'medianWordExtraPt':statistics.median(ds),'minWordExtraPt':min(ds),'maxWordExtraPt':max(ds),'pairs':row_pairs},'bodyGeometry':capacity,'nativeRequirementCellExample':native_req1,'images':{'count':371,'sourcePixelDimensionsAndOrderExact':True,'minHeightDeltaPt':min(height_deltas),'maxHeightDeltaPt':max(height_deltas)},'nativeRootHeadingFlags':heading_flags,'runtimeChanged':False,'pdfRebuilt':False,'limitations':['No counterfactual layout run, so exact contribution of each mechanism to the final two-page count is not isolated.','Baseline, page14 and meeting improvements retained by unchanged artifact hashes.','Paired row height includes paragraph, image, padding and border footprints; residual is not attributed to image alone.']}
(D/'diagnosis.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
for x in frozen:assert sha(Path(x['path']))==x['sha256']
print(json.dumps({'counts':result['requirements']['pageDeltaCounts'],'rowPairs':{k:v for k,v in result['consecutiveSameTableRowsOnSamePages'].items()if k!='pairs'},'bodyGeometry':capacity,'images':result['images'],'orphanHeadings':[{k:r[k]for k in ['text','pdfPage','pdfFollowingTableFirstHeaderPage','wordPage','wordFollowingTableHeaderPage']}for r in orphan]},ensure_ascii=False,indent=2))
