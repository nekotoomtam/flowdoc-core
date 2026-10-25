"""Freeze native controls before assessing a font-derived layout policy."""
from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as E
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'fidelity-goal-g1';H=O.parent/'docx-pagination-2026-10-23/fidelity-system-r13';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
frozen=json.loads((O/'pagination-e12/frozen-inputs.json').read_text())
for p in [O/'pagination-e12/SRS-K2-padding-half-top.pdf',O/'pagination-e12/K2-padding-half-top-draw.json',O/'pagination-e12/calibration.json',H/'fonts.json',H/'matrix.json',H/'development/reference-inventory.json',H/'development/generation-receipts.json']:frozen.append({'path':str(p),'sha256':sha(p)})
inventory={x['packet']:x for x in json.loads((H/'development/reference-inventory.json').read_text())};matrix=json.loads((H/'matrix.json').read_text());packets=[]
for packet in matrix['packets']:
 if packet['partition']!='development':continue
 name=packet['packet'];source=H/packet['input'];docx=H/'development/r11-baseline'/(name+'.docx');word=H/'development/r11-baseline'/(name+'-word.pdf')
 assessment=H/'development'/(name+'-assessment.json')
 if not assessment.exists():assessment=H/'development'/(name+'-provenance-assessment.json')
 assessmentData=json.loads(assessment.read_text())
 assert sha(source)==packet['sha256']
 if 'nativePDFSHA256' in assessmentData:assert sha(word)==assessmentData['nativePDFSHA256']
 assert sha(H/'development/r11-baseline'/(name+'.pdf'))==inventory[name]['pdfSHA256']
 frozen.append({'path':str(assessment),'sha256':sha(assessment)})
 with zipfile.ZipFile(docx) as z:root=E.fromstring(z.read('word/document.xml'))
 props={}
 for p in root.iter(W+'p'):
  text=''.join(x.text or '\n' if x.tag==W+'br' else x.text or '' for x in p.iter() if x.tag in [W+'t',W+'br'])
  spacing=p.find(W+'pPr/'+W+'spacing');rule=spacing.get(W+'lineRule') if spacing is not None else None
  if text:props.setdefault(text,set()).add(rule)
 d=json.loads(source.read_text());selected=[]
 for id,n in d['nodes'].items():
  if n['type']!='text-block' or any(x['type'] not in ['text','line-break'] for x in n['children']):continue
  text=''.join(x.get('text','\n') for x in n['children'])
  if props.get(text)=={'atLeast'}:selected.append(id)
 for p in [source,docx,word]:frozen.append({'path':str(p),'sha256':sha(p)})
 packets.append({'packet':name,'input':packet['input'],'selectedNativeAtLeastNodeIds':selected,'nativePdf':str(word),'docx':str(docx),'identityBasis':'Existing native hash record' if 'nativePDFSHA256' in assessmentData else 'Historical glyph-provenance report and fresh hash pin; original native hash absent from this report'})
for font in json.loads((H/'fonts.json').read_text()):
 p=H/Path(font['path'].removeprefix('/proof/'));assert sha(p)==font['sha256'];frozen.append({'path':str(p),'sha256':sha(p)})
assert all(sha(Path(x['path']))==x['sha256'] for x in frozen)
(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2),encoding='utf8');(D/'matrix-admission.json').write_text(json.dumps(packets,indent=2),encoding='utf8')
(D/'goal.json').write_text(json.dumps({'authority':'Owner asks autonomous outcome management; Core inline Product Implementation then Evidence Reviewer; no registry IDs; no merge.','goal':'Font-derived stable placement closer to native Word, preserving frozen SRS100pages/361REQ starts and page14/meeting improvements. Evidence distinguishes complete SRS from supported font-control scope.','fontScope':'Sarabun/Bai Jamjuree Regular,Bold,Italic,BoldItalic at10/12/16pt; retained native AtLeast controls admitted by exact source paragraph text/XML rule. Exact/source-guided controls remain unmodified.','proofBudget':'Initial2 SRS PDFs plus8 font packets; expand only for actual correctness/scope issue, retain rejected factors. Offline1GiB. One code/evidence review.','documentBudget':'Append existing Project Control record only.','acceptance':'No SRS pagination/coverage regression; lower measured text-placement error without per-REQ corrections; scoped native font comparison and clear unsupported residuals. Do not label overall fidelity PASS from marker origins alone.'},indent=2),encoding='utf8')
print('frozen',len(frozen),'font packets',len(packets))
