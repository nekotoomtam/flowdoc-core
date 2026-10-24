from pathlib import Path
import json,zipfile,xml.etree.ElementTree as E,re,hashlib
O=Path(r'C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e7';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
model=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));body=next(s for s in model['sections']if s['sectionId']=='body');native={}
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx')as z:
 root=E.fromstring(z.read('word/document.xml'))
 for p in root.findall(W+'body/'+W+'p'):
  pr=p.find(W+'pPr')
  if pr is None or pr.find(W+'outlineLvl')is None:continue
  text=''.join(t.text or''for t in p.iter(W+'t'));key=re.sub('[^A-Za-z0-9]','',text);kn=pr.find(W+'keepNext');kl=pr.find(W+'keepLines')
  native.setdefault(key,[]).append({'text':text,'keepNext':kn is not None and kn.get(W+'val')!='false','keepLines':kl is not None and kl.get(W+'val')!='false'})
selected=[];mapping=[]
for id in body['rootIds']:
 n=model['nodes'][id]
 if n['type']!='text-block'or not n['props'].get('toc'):continue
 text=''.join(t.get('text','')for t in n['children']);key=re.sub('[^A-Za-z0-9]','',text);matches=native.get(key,[]);assert len(matches)==1,(id,matches)
 row={'nodeId':id,**matches[0]};mapping.append(row)
 if row['keepNext']and row['keepLines']:selected.append(id)
cal=json.loads((O/'spacing-e5/calibration.json').read_text());cal['nativeKeepNextHeadingIds']=selected
cal['groupingAuthority']='Only body heading paragraphs explicitly keepNext+keepLines in the frozen native DOCX. Immediate table or one plain description then table. Whole headers plus first body item; no full breakable row keep.'
(D/'calibration.json').write_text(json.dumps(cal,ensure_ascii=False,indent=2),encoding='utf8');(D/'native-heading-map.json').write_text(json.dumps(mapping,ensure_ascii=False,indent=2),encoding='utf8')
frozen=json.loads((O/'pagination-e6/diagnosis.json').read_text(encoding='utf8'))['frozenInputs']
assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256']for x in frozen)
(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2),encoding='utf8');print('Mapped',len(mapping),'headings; selected',len(selected))
