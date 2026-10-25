"""Read-only E10: cache frozen page text geometry and exact REQ offsets."""
from pathlib import Path
import json,re,hashlib,collections
import pdfplumber
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e10'
paths={'PDF':O/'pagination-e9/SRS-F1-native-bottom.pdf','Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'}
frozen=json.loads((O/'pagination-e9/frozen-inputs.json').read_text());frozen.append({'path':str(paths['PDF']),'sha256':hashlib.sha256(paths['PDF'].read_bytes()).hexdigest()})
assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256'] for x in frozen)
(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2))
data={}
for name,path in paths.items():
 pages=[];req=[]
 with pdfplumber.open(path) as pdf:
  for pn,page in enumerate(pdf.pages,1):
   lines=[]
   for line in page.extract_text_lines(return_chars=True):
    if line['top']<775:
     chars=[{'t':c['text'],'x':c['x0'],'r':c['x1'],'baseline':page.height-c['matrix'][5]} for c in line['chars']]
     row={'text':line['text'],'page':pn,'top':line['top'],'bottom':line['bottom'],'baseline':chars[0]['baseline'],'chars':chars};lines.append(row)
     for id in re.findall(r'REQ\d{4}',line['text']):req.append({k:v for k,v in {'id':id,**row}.items() if k!='chars'})
   pages.append({'page':pn,'lines':lines,'images':[{'top':i['top'],'bottom':i['bottom'],'x0':i['x0'],'x1':i['x1']} for i in page.images if i['top']>1],'edges':[{'x0':e['x0'],'x1':e['x1'],'top':e['top'],'bottom':e['bottom']} for e in page.edges if e['orientation']=='h' and 75<e['top']<775]});page.close()
 data[name]={'pages':pages,'req':req};print('read',name,len(pages),len(req),flush=True)
 (D/(name+'-geometry.json')).write_text(json.dumps(data[name],ensure_ascii=False),encoding='utf8')
assert len(data['PDF']['req'])==len(data['Word']['req'])==361 and [x['id'] for x in data['PDF']['req']]==[x['id'] for x in data['Word']['req']]
pairs=[{'id':a['id'],'pdfPage':a['page'],'wordPage':b['page'],'pdfBaseline':a['baseline'],'wordBaseline':b['baseline'],'delta':b['page']-a['page']} for a,b in zip(data['PDF']['req'],data['Word']['req'])]
bad=[r for r in pairs if r['delta']];assert len(bad)==57 and all(r['delta']==1 for r in bad)
groups=[]
for i,r in enumerate(pairs):
 if r['delta'] and (i==0 or not pairs[i-1]['delta']):groups.append({'start':r,'preceding':pairs[i-1] if i else None,'ids':[]})
 if r['delta']:groups[-1]['ids'].append(r['id']);groups[-1]['end']=r
(D/'requirement-pairs.json').write_text(json.dumps(pairs,indent=2));(D/'mismatch-groups.json').write_text(json.dumps(groups,indent=2))
print(json.dumps({'mismatches':57,'groups':groups},indent=2))
