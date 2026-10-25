"""Read-only final geometry checks for the frozen E9 candidate."""
from pathlib import Path
import json,hashlib
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e9'
r=json.loads((D/'comparison-result.json').read_text(encoding='utf8'));pairs=json.loads((D/'row-pairs.json').read_text())
r['rowMetricScope']=r['rowMetricScope'].replace('all four artifacts','all three artifacts')
assert all(abs(x['F1-native-bottom']-x['F0-R2-control'])<1e-8 for x in pairs)
r['unchangedCommonRowIntervals']=len(pairs)
model=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));draw=json.loads((D/'F1-native-bottom-draw.json').read_text())
bodyIds={id for id,s in model['sourceMap'].items() if s.get('sectionId')=='body'}
ends=[x['y']+x['height'] for p in draw for x in p['runs'] if x['nodeId'] in bodyIds]
r['maxBodyTextBoxBottomPt']=max(ends);assert max(ends)<=r['nativeBodyBottomPt']+1e-6
assert r['factors']['F1-native-bottom']['changedDistinctLineMetricNodes']==['section-contents~toc']
a=pdfium.PdfDocument(str(D/'SRS-F0-R2-control.pdf'));b=pdfium.PdfDocument(str(D/'SRS-F1-native-bottom.pdf'));footer=[]
assert len(a)==len(b)==99, 'Frozen E9 footer audit requires99page factors'
for pn in range(1,100):
 x=a[pn-1].render(scale=1).to_pil().convert('RGB');y=Image.open(D/'F1-pages'/f'{pn:03}.png').convert('RGB')
 if x.crop((0,775,x.width,x.height)).tobytes()!=y.crop((0,775,y.width,y.height)).tobytes():footer.append(pn)
assert not footer
r['footerRasterChanged']=footer
sheet=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(sheet)
for col,(doc,name) in enumerate([(a,'E8 control'),(b,'F1')]):sheet.paste(doc[8].render(scale=1.4).to_pil().convert('RGB'),(834*col,28));label.text((834*col+8,5),name+' TOC page9',fill='black')
sheet.save(D/'toc-page9.png');a.close();b.close()
r['frozenInputs']=json.loads((D/'frozen-inputs.json').read_text());assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256'] for x in r['frozenInputs'])
r['selectedFactor']='F1-native-bottom'
r['visualReview']={'changedBodyPages':'45 and47-99 reviewed in seven overview sheets including unchanged46','detailedPairs':['45/45','99/100','TOC9 E8/F1'],'unchangedPages':'Reuse E8 review for pages1-8,10-44,46 supported by whole-page raster equality.','newVisibleClippingObserved':False,'scope':'Overview and selected detailed pairs, not every glyph at high resolution.'}
r['auditSetupNote']='First audit used an incorrect E8 control filename and stopped before measurement; corrected path then audit/finalizer pass. Candidate PDFs unchanged.'
red=json.loads((D/'red.json').read_text());r['tests']['redFailures']=red['numFailedTests'];r['tests']['redPreexistingPasses']=red['numPassedTests']
r['codeReview']={'critical':0,'important':0,'minorFixed':['Fixed99page raster loops now assert both actual PDF counts before reviewing.','Red counts read from retained test report.'],'disposition':'Bounded experiment retention only, no default/merge/packaging/general-font acceptance.'}
(D/'comparison-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
compact={k:v for k,v in r.items() if k!='raster'};compact['raster']=r['raster']
(Path(__file__).parent/'word-footer-result.json').write_text(json.dumps(compact,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'unchangedCommonRowIntervals':len(pairs),'maxBodyTextBoxBottomPt':max(ends),'footerRasterChanged':footer,'changedPages':r['raster']['F1-native-bottom']['wholePageChanged']}))
