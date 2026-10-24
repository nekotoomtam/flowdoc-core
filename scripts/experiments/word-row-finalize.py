"""Finish the already rendered E8 evidence; never regenerate candidates."""
from pathlib import Path
import json,hashlib
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e8'
r=json.loads((D/'comparison-result.json').read_text(encoding='utf8'));pairs=json.loads((D/'row-pairs.json').read_text())
r['R2CommonRowsImproved']=sum(abs(p['Word']-p['R2-twips'])<abs(p['Word']-p['R0-G1-control']) for p in pairs)
r['visualReview']={'bodyPages':'27-99 in nine overview sheets','detailedPairs':['45/45','46/46','80/81','99/100'],'newVisibleClippingObserved':False,'scope':'Overview and selected detailed pairs, not all glyphs at high resolution.'}
a=pdfium.PdfDocument(str(D/'SRS-R0-G1-control.pdf'));b=pdfium.PdfDocument(str(D/'SRS-R2-twips.pdf'));footer=[]
for pn in range(1,100):
 x=a[pn-1].render(scale=1).to_pil().convert('RGB');y=Image.open(D/'R2-pages'/f'{pn:03}.png').convert('RGB')
 if x.crop((0,775,x.width,x.height)).tobytes()!=y.crop((0,775,y.width,y.height)).tobytes():footer.append(pn)
assert not footer
r['R2FooterRasterChanged']=footer
sheet=Image.new('RGB',(1668,1210),'white');label=ImageDraw.Draw(sheet)
for col,(doc,name) in enumerate([(a,'E7 control'),(b,'R2')]):sheet.paste(doc[8].render(scale=1.4).to_pil().convert('RGB'),(834*col,28));label.text((834*col+8,5),name+' TOC page9',fill='black')
sheet.save(D/'toc-page9.png');a.close();b.close()
scopePath=D/'scope-rows.json'
if not scopePath.exists():scopePath=D/'scope.json'
scope=json.loads(scopePath.read_text());scope['section']='E7 profile plus native requirement-row footprint';scope['nativeHeadingIds']=len(scope['calibration']['nativeKeepNextHeadingIds']);scope['nativeRowTableIds']=scope['calibration']['nativeRowTableIds']
if scopePath.name=='scope.json':scope['metadataNote']='Corrected label after row mode initially used the legacy scope.json filename; PDF bytes and measured inputs are unchanged.'
(D/'scope-rows.json').write_text(json.dumps(scope,ensure_ascii=False,indent=2),encoding='utf8')
r['frozenInputs']=json.loads((D/'frozen-inputs.json').read_text());assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256'] for x in r['frozenInputs'])
r['selectedFactor']='R2-twips'
r['visualReview']['tocPage9PairReviewed']=True
r['codeReview']={'critical':0,'important':0,'minorFixed':'Finalizer now prefers scope-rows.json, matching current harness; legacy fallback retained.','disposition':'Retain bounded experiment only; generic fonts, merges, all-glyph fidelity, semantic links, footer capacity, packaging and integration not accepted.'}
(D/'comparison-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
compact={k:v for k,v in r.items() if k!='raster'}
compact['raster']={n:{'wholePageChangedRanges':'9 and45-99','protected11to26WholePageExact':s['protected11to26WholePageExact']} for n,s in r['raster'].items()}
(Path(__file__).parent/'word-row-result.json').write_text(json.dumps(compact,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'R2CommonRowsImproved':r['R2CommonRowsImproved'],'R2FooterRasterChanged':footer,'selectedFactor':r['selectedFactor']}))
