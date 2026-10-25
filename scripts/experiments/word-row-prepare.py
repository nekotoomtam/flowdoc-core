"""Freeze E8 profile from retained DOCX, never fitted average residuals."""
from pathlib import Path
import json,re,zipfile,xml.etree.ElementTree as E,hashlib
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e8';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
m=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));body=next(s for s in m['sections'] if s['sectionId']=='body')
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx') as z:
 root=E.fromstring(z.read('word/document.xml'));native={}
 for t in root.findall(W+'body/'+W+'tbl'):
  reqs=re.findall(r'REQ\d{4}',''.join(x.text or '' for x in t.iter(W+'t')))
  if reqs:native[reqs[0]]=t
selected=[];profile=[]
for id in body['rootIds']:
 t=m['nodes'][id]
 if t['type']!='table':continue
 cells=[m['nodes'][c] for r in t['rowIds'] for c in m['nodes'][r]['cellIds']]
 reqs=re.findall(r'REQ\d{4}',''.join(x.get('text','') for c in cells for b in c['childIds'] for x in m['nodes'][b].get('children',[])))
 if not reqs:continue
 nt=native[reqs[0]];border=nt.find(W+'tblPr/'+W+'tblBorders/'+W+'bottom');assert border.get(W+'sz')=='4'
 assert t['props']['headerRowCount']==1 and all((c['props'].get('rowSpan',1),c['props'].get('colSpan',1))==(1,1) for c in cells)
 assert all(c['props']['padding'][s]=={'unit':'pt','value':3} for c in cells for s in ['top','bottom'])
 for c in nt.iter(W+'tc'):
  mar=c.find(W+'tcPr/'+W+'tcMar');assert all(mar.find(W+s).get(W+'w')=='60' for s in ['top','bottom'])
 selected.append(id);profile.append({'tableId':id,'firstReq':reqs[0],'borderPt':.5,'nativeVerticalMarginTwips':60,'spacingDeclarations':[dict(s.attrib) for s in nt.iter(W+'spacing')]})
cal=json.loads((O/'pagination-e7/calibration.json').read_text(encoding='utf8'));cal['nativeRowTableIds']=selected
cal['nativeRowAuthority']='Frozen native requirement tables: 60-twip margins and 4-eighth-point borders. Optional text-line round to 20 twips/pt. No fitted residual, footer or source mutation.'
(D/'calibration.json').write_text(json.dumps(cal,ensure_ascii=False,indent=2),encoding='utf8');(D/'native-row-profile.json').write_text(json.dumps(profile,indent=2),encoding='utf8')
frozen=json.loads((O/'pagination-e7/frozen-inputs.json').read_text())
for p in [O/'pagination-e7/SRS-G1-table-start.pdf',O/'pagination-e7/G1-table-start-draw.json',O/'pagination-e7/calibration.json']:
 frozen.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256'] for x in frozen)
(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2),encoding='utf8')
(D/'plan.json').write_text(json.dumps({'scope':'E8 requirement row footprint; retain E7 and M2; no footer or merge','owner':'Core inline implementation then evidence review; execution IDs N/A','proofBudget':'3 full-source PDF factors; targeted red; affected layout/cache tests and compile; frozen-source audit and page review','acceptance':['control byte-exact E7','17 heading separations remain resolved','page14/meeting content exact above footer','source text/images retained','quantify row residual without forcing 100 pages'],'unknowns':{'inlineImageParagraphExtra':'deferred unless isolated as material','footerCapacity':'excluded'}},indent=2),encoding='utf8')
print('selected',len(selected),'native requirement tables')
