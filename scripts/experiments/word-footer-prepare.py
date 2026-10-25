"""Derive E9 capacity from frozen native section XML, not a fitted page count."""
from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as E
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e9';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx') as z:
 root=E.fromstring(z.read('word/document.xml'));sections=list(root.iter(W+'sectPr'));s=sections[-1];p=s.find(W+'pgSz');mar=s.find(W+'pgMar')
model=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));assert len(model['sections'])==len(sections)==7 and model['sections'][-1]['sectionId']=='body'
geometry={'sectionId':'body','nativeSectionIndex':6,'nativePageHeightTwips':int(p.get(W+'h')),'nativeBottomMarginTwips':int(mar.get(W+'bottom')),'nativeFooterDistanceTwips':int(mar.get(W+'footer')),'bodyBottomPt':(int(p.get(W+'h'))-int(mar.get(W+'bottom')))/20,'authority':'Frozen DOCX sectPr; PDF body capacity only, no footer paint movement or source mutation.'}
cal=json.loads((O/'pagination-e8/calibration.json').read_text(encoding='utf8'));cal['nativeBottom']=geometry
(D/'calibration.json').write_text(json.dumps(cal,ensure_ascii=False,indent=2),encoding='utf8')
frozen=json.loads((O/'pagination-e8/frozen-inputs.json').read_text())
for p in [O/'pagination-e8/SRS-R2-twips.pdf',O/'pagination-e8/R2-twips-draw.json',O/'pagination-e8/calibration.json']:
 frozen.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256'] for x in frozen)
(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2),encoding='utf8')
(D/'plan.json').write_text(json.dumps({'scope':'E9 body-only native bottom capacity; preserve E8 row rule/E7 groups/M2 introduction; no merge','owner':'Core inline implementation then Evidence Reviewer, execution IDs N/A','proofBudget':'2 full-source PDF outputs, one targeted red plus affected layout/cache green and compile; source/hash/link/geometry audit and full-page review','acceptance':['control byte exact E8','native bottom from frozen XML','row metrics and line cuts retained','heading/table groups remain intact','page14 and meeting content above footer retained','source text/images and bounded links retained','quantify native physical page/line alignment without arbitrary capacity tuning'],'documentBudget':'append existing Project Control record only','risks':'A matching total is not full pagination/glyph parity; native footer reservation is provisional in DOCX writer, this is frozen-artifact experiment only.'},indent=2),encoding='utf8')
print(json.dumps(geometry,indent=2))
