from pathlib import Path
import json,re,hashlib,statistics,collections,zipfile,xml.etree.ElementTree as E
import pdfplumber,pypdfium2 as pdfium
from PIL import Image,ImageDraw
O=Path(r'C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'spacing-e5';W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
paths={'Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf','C2':O/'spacing-e4/SRS-C2-combined.pdf',**{n:D/('SRS-'+n+'.pdf')for n in ['M1-paragraph','M2-boundary']}}
data={};inventory={}
for name,path in paths.items():
 pages=[]
 with pdfplumber.open(path)as pdf:
  inventory[name]={'path':str(path),'sha256':sha(path),'pages':len(pdf.pages),'bytes':path.stat().st_size}
  for pn,p in enumerate(pdf.pages,1):
   ls=p.extract_text_lines(return_chars=True)
   pages.append({'lines':[{'text':l['text'],'baseline':p.height-l['chars'][0]['matrix'][5],'top':l['top'],'bottom':l['bottom']}for l in ls if l['top']<775],
    'images':[(round(i['x0'],4),round(i['top'],4),round(i['width'],4),round(i['height'],4))for i in p.images],
    'req':[(rid,round(p.height-l['chars'][0]['matrix'][5],4))for l in ls for rid in re.findall('REQ[0-9]{4}',l['text'])],
    'footer':[l['text']for l in ls if l['top']>=775]})
   p.close()
 data[name]=pages;print('extracted',name,flush=True)
def index(name,lo,hi):
 keys={}
 for pn in range(lo,hi+1):
  for line in data[name][pn-1]['lines']:
   key=re.sub('[^A-Za-z0-9]','',line['text'])
   if len(key)>=8 and re.search('[A-Za-z]{3}',key):keys.setdefault(key,[]).append((pn,line['baseline']))
 return {key:xs[0]for key,xs in keys.items()if len(xs)==1}
metrics={}
for lo,hi,label in [(11,26,'introduction'),(17,26,'meetings')]:
 target=index('Word',lo,hi);metrics[label]={}
 for name in ['C2','M1-paragraph','M2-boundary']:
  ix=index(name,lo,hi);pairs=[{'key':k,'candidatePage':ix[k][0],'wordPage':target[k][0],'deltaPt':ix[k][1]-target[k][1]}for k in sorted(ix.keys()&target.keys())]
  same=[r for r in pairs if r['candidatePage']==r['wordPage']];ds=[abs(r['deltaPt'])for r in same]
  metrics[label][name]={'matched':len(pairs),'samePage':len(same),'meanAbsolutePt':statistics.mean(ds),'maxAbsolutePt':max(ds),'pairs':pairs}
render={n:pdfium.PdfDocument(str(p))for n,p in paths.items()};changed=[]
for pn in range(1,99):
 a=render['C2'][pn-1].render(scale=1).to_pil().convert('RGB');b=render['M2-boundary'][pn-1].render(scale=1).to_pil().convert('RGB')
 if a.tobytes()!=b.tobytes():changed.append(pn)
 if 17<=pn<=26:
  for name in ['Word','C2','M2-boundary']:
   out=D/(name+'-pages');out.mkdir(exist_ok=True);render[name][pn-1].render(scale=1.4).to_pil().convert('RGB').save(out/f'{pn:03}.png')
for group in range(3):
 sheet=Image.new('RGB',(1668,1250),'#ddd');draw=ImageDraw.Draw(sheet)
 for j in range(4):
  pn=17+group*4+j
  if pn>26:continue
  for col,name in enumerate(['Word','M2-boundary']):
   im=Image.open(D/(name+'-pages')/f'{pn:03}.png');im.thumbnail((400,580));x=(j%2)*834+col*417;y=(j//2)*625;sheet.paste(im,(x,y+30));draw.text((x+5,y+5),f'{name} physical {pn}',fill='black')
 sheet.save(D/f'overview-{group+1}.jpg')
sheet=Image.new('RGB',(2502,1210),'white');draw=ImageDraw.Draw(sheet)
for col,name in enumerate(['C2','Word','M2-boundary']):
 sheet.paste(render[name][18].render(scale=1.4).to_pil().convert('RGB'),(834*col,28));draw.text((834*col+12,5),name,fill='black')
sheet.save(D/'page19-comparison.png')
# Keep page14 as a strict pixel equality gate, independent of selected anchors.
assert 14 not in changed
for name in ['Word','M2-boundary']:
 im=render[name][18].render(scale=3).to_pil().convert('RGB');im.crop((0,1550,1786,2150)).save(D/(name+'-thai-detail.png'))
for p in render.values():p.close()
old=data['C2'];new=data['M2-boundary'];bodyCounter=lambda ps:collections.Counter(re.sub(r'\s','', ''.join(l['text']for p in ps for l in p['lines'])))
frozen=json.loads((D/'frozen-inputs.json').read_text());assert all(sha(Path(x['path']))==x['sha256']for x in frozen)
model=json.loads((O/'resolved-document.json').read_text(encoding='utf8'));draw=json.loads((D/'M2-boundary-draw.json').read_text());runs=collections.defaultdict(list)
for p in draw:
 for r in p['runs']:runs[r['nodeId']].append(r['text'])
coverage=[];failures=[]
for id,n in model['nodes'].items():
 if not id.startswith('section-introduction~')or n.get('type')!='text-block' or any(c['type']not in ['text','line-break']for c in n['children']):continue
 expected=re.sub(r'\s','', ''.join(c.get('text','\n')for c in n['children']))
 if not expected:continue
 actual=re.sub(r'\s','', ''.join(runs[id]));copies=len(actual)//len(expected)
 if copies<1 or actual!=expected*copies:failures.append({'id':id,'expected':expected,'actual':actual})
 coverage.append({'nodeId':id,'copies':copies,'sourceExactModuloRepeatedCopy':copies>=1 and actual==expected*copies})
with zipfile.ZipFile(O/'spacing-e3/SRS-spacing-D-cell-baseline.docx')as z:
 root=E.fromstring(z.read('word/document.xml'));body=list(root.find(W+'body'));boundaries=[]
 for i,e in enumerate(body[1:-1],1):
  if e.tag==W+'p' and body[i-1].tag==body[i+1].tag==W+'tbl':
   left=''.join(t.text or''for t in body[i-1].find(W+'tr').iter(W+'t'));right=''.join(t.text or''for t in body[i+1].find(W+'tr').iter(W+'t'))
   if not left.startswith('บันทึกการประชุม')or not right.startswith('บันทึกการประชุม'):continue
   spacing=e.find(W+'pPr/'+W+'spacing');stroke=body[i-1].find(W+'tblPr/'+W+'tblBorders/'+W+'bottom')
   boundaries.append({'separatorLinePt':int(spacing.get(W+'line'))/20,'lineRule':spacing.get(W+'lineRule'),'bottomStrokePt':int(stroke.get(W+'sz'))/8})
green=json.loads((D/'green.json').read_text())
result={'authorityBoundary':'Core experimental result; Project Control owns shared status. No general Word rule or integration.','inputs':inventory,'metrics':metrics,'changedRasterPages':changed,'page14PixelExact':14 not in changed,'outsideMeetingPagesPixelExact':all(17<=p<=26 for p in changed),'requirementOrderPageBaselineExact':[p['req']for p in old]==[p['req']for p in new],'imagesByPageExact':[p['images']for p in old]==[p['images']for p in new],'footersExact':[p['footer']for p in old]==[p['footer']for p in new],'extractedBodyCharacterMultisetExact':bodyCounter(old)==bodyCounter(new),'sourcePlainTextCoverage':{'checked':len(coverage),'failed':failures,'scope':'Source introduction plain text nodes; per-node text exact modulo repeated copies. Not complete glyph identity.'},'nativeBoundaryEvidence':boundaries,'frozenInputsPreserved':True,'tests':{'passed':green['numPassedTests'],'failed':green['numFailedTests']},'defaultBehaviorChanged':False,'generalRuleAccepted':False}
(D/'source-text-coverage.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf8')
(D/'comparison-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items()if k not in ['inputs','metrics']},ensure_ascii=False,indent=2));print('METRICS',json.dumps({k:{n:{kk:vv for kk,vv in v.items()if kk!='pairs'}for n,v in values.items()}for k,values in metrics.items()},indent=2))
