"""E12 freeze E11; derive body start and border reservation from native source."""
from pathlib import Path
import json,re,hashlib,zipfile,xml.etree.ElementTree as E
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e12';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));cal=json.loads((O/'pagination-e11/calibration.json').read_text(encoding='utf8'))
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx') as z:root=E.fromstring(z.read('word/document.xml'))
sect=list(root.iter(W+'sectPr'))[-1];top=int(sect.find(W+'pgMar').get(W+'top'))/20
table=next(t for t in root.findall(W+'body/'+W+'tbl') if re.search(r'REQ\d{4}',''.join(x.text or '' for x in t.iter(W+'t'))))
stroke=int(table.find(W+'tblPr/'+W+'tblBorders/'+W+'top').get(W+'sz'))/8
cal['nativeBodyStart']={'sectionId':'body','nativeTopMarginTwips':round(top*20),'bodyTopPt':top,'tableStrokePt':stroke,'hypothesis':'Frozen native body margin; isolate its table-start stroke envelope rather than change row metrics or force individual REQ breaks.'}
(D/'calibration.json').write_text(json.dumps(cal,ensure_ascii=False,indent=2),encoding='utf8')
frozen=json.loads((O/'pagination-e11/frozen-inputs.json').read_text())
for p in [O/'pagination-e11/SRS-V1-paragraph-minimum.pdf',O/'pagination-e11/V1-paragraph-minimum-draw.json',O/'pagination-e11/calibration.json',O/'pagination-e11/requirement-pairs.json',O/'pagination-e11/comparison-result.json']:frozen.append({'path':str(p),'sha256':sha(p)})
assert all(sha(Path(x['path']))==x['sha256'] for x in frozen)
(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2),encoding='utf8')
(D/'plan.json').write_text(json.dumps({'scope':'E12 four residual REQ starts. Keep E11/E9/E8/E7/M2, same worktree, no merge or baseline replacement.','owner':'Core inline discovery then opt-in experiment then Evidence Reviewer; execution IDs N/A','initialFactors':['T0 E11 byte exact control','T1 native body top margin81pt','T2 native body top plus native half-point table stroke envelope81.5pt','T3 native body top plus half-stroke81.25pt'],'acceptance':['retain all357 existing aligned starts','quantify/fix four residuals without REQ-specific breaks','100pages, long-row flow, paragraph minima, source/image/link coverage','intro11-26 content retained, existing row/line metrics unchanged'],'initialProofBudget':'3 complete source PDF factors plus one causal follow-up; affected tests only if runtime changed; full-page scan/render and one independent review','correctnessRepairExtension':{'reason':'Padded regression proves E11 cut excludes trailing padding and carries an extra line. Top-only factors exposed this; preserving the error would invalidate the experiment. User authorized autonomous residual repair.','additionalArtifacts':['K1 corrected cut, E11 top','K2 corrected cut plus source-derived81.25pt top'],'additionalChecks':'targeted red, compile and affected layout/cache green; source/geometry audit and selected final PDF all-page review','actualTotalPdfFactors':6},'documentBudget':'append existing Project Control record only','risks':'Native border stroke ownership at page start is a hypothesis; .5pt derives actual source border, not fit. Reject regressions rather than tune margin arbitrarily.'},indent=2),encoding='utf8')
print(json.dumps(cal['nativeBodyStart'],indent=2))
