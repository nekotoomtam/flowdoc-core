"""E11 selects native widow-controlled body paragraphs; frozen E9 profile."""
from pathlib import Path
import json,hashlib,re,zipfile,xml.etree.ElementTree as E
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e11';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
m=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));cal=json.loads((O/'pagination-e9/calibration.json').read_text(encoding='utf8'))
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx') as z:
 root=E.fromstring(z.read('word/document.xml'));styles=E.fromstring(z.read('word/styles.xml'))
 assert not list(styles.iter(W+'widowControl'))
 native={}
 for t in root.findall(W+'body/'+W+'tbl'):
  reqs=re.findall(r'REQ\d{4}',''.join(x.text or '' for x in t.iter(W+'t')))
  if reqs:native[reqs[0]]=t
selected=[];profile=[]
for tid in cal['nativeRowTableIds']:
 t=m['nodes'][tid];rows=[m['nodes'][r] for r in t['rowIds'][t['props']['headerRowCount']:]]
 first=''.join(x.get('text','') for b in m['nodes'][rows[0]['cellIds'][0]]['childIds'] for x in m['nodes'][b].get('children',[]));req=re.search(r'REQ\d{4}',first)[0]
 nt=native[req];nativeRows=nt.findall(W+'tr')[1:];assert len(nativeRows)==len(rows)
 for row,nrow in zip(rows,nativeRows):
  cant=nrow.find(W+'trPr/'+W+'cantSplit')
  assert row['props']['allowBreak'] and (cant is None or cant.get(W+'val','true') in ['false','0','off'])
  ncells=nrow.findall(W+'tc');assert len(ncells)==len(row['cellIds'])
  for cid,nc in zip(row['cellIds'],ncells):
   c=m['nodes'][cid];texts=[m['nodes'][id] for id in c['childIds'] if m['nodes'][id]['type']=='text-block'];ps=[p for p in nc.findall(W+'p') if not list(p.iter(W+'drawing')) and ''.join(x.text or '' for x in p.iter(W+'t'))]
   nonempty=[n for n in texts if ''.join(x.get('text','') for x in n['children']).strip()]
   assert len(nonempty)==len(ps),(cid,len(nonempty),len(ps))
   for n,p in zip(nonempty,ps):
    assert re.sub(r'\s','', ''.join(x.get('text','') for x in n['children']))==re.sub(r'\s','', ''.join(x.text or '' for x in p.iter(W+'t'))),n['id']
    flag=p.find(W+'pPr/'+W+'widowControl');on=flag is None or flag.get(W+'val','true') not in ['false','0','off']
    if on:selected.append(n['id'])
    profile.append({'nodeId':n['id'],'tableId':tid,'nativeWidowControl':None if flag is None else flag.attrib,'enabled':on})
cal['nativeWidowNodeIds']=selected
(D/'calibration.json').write_text(json.dumps(cal,ensure_ascii=False,indent=2),encoding='utf8');(D/'native-paragraph-profile.json').write_text(json.dumps(profile,indent=2),encoding='utf8')
frozen=json.loads((O/'pagination-e9/frozen-inputs.json').read_text())
for p in [O/'pagination-e9/SRS-F1-native-bottom.pdf',O/'pagination-e9/F1-native-bottom-draw.json',O/'pagination-e9/calibration.json',O/'pagination-e10/diagnosis.json',O/'pagination-e10/PDF-geometry.json',O/'pagination-e10/Word-geometry.json',O/'pagination-e10/feature-lines.json']:frozen.append({'path':str(p),'sha256':sha(p)})
assert all(sha(Path(x['path']))==x['sha256'] for x in frozen)
(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2),encoding='utf8')
(D/'plan.json').write_text(json.dumps({'scope':'E11 native paragraph widow/orphan minimum in selected ordinary body cells; retain E9/E8/E7/M2; no merge','owner':'Core inline Product Implementation Agent then Evidence Reviewer; execution IDs N/A','proofBudget':'Two full-source PDF factors; targeted red and green; compile plus affected layout/cache suite; all-page raster and source/geometry audit; bounded repairs for actual failures','acceptance':['byte exact E9 control','long rows continue without singleton paragraph ends where feasible','all361 REQ order and source coverage','E8 line/row metrics, E7 heading/table start, intro11-26 content retained','report actual Word page alignment without forcing counts'],'documentBudget':'one append to existing Project Control record','limitations':'Frozen SRS artifact experiment, no generic font/Word parity claim'},indent=2),encoding='utf8')
print('Selected',len(selected),'native paragraph nodes in',len(cal['nativeRowTableIds']),'tables')
