from pathlib import Path
import json,re,hashlib,statistics,collections
import pdfplumber,pypdfium2 as pdfium
from PIL import Image,ImageDraw
O=Path(r'C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'spacing-e4'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
files={'Word':O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf',**{n:D/('SRS-'+n+'.pdf')for n in ['control','H-header','B-border','L-linebox','C-combined','C2-combined']}}
inventory={};texts={};lines={};req={};images={};footer={}
for name,path in files.items():
 texts[name]=[];lines[name]=[];req[name]=[];images[name]=[];footer[name]=[]
 with pdfplumber.open(path)as pdf:
  inventory[name]={'path':str(path),'sha256':sha(path),'pages':len(pdf.pages),'bytes':path.stat().st_size}
  for i,p in enumerate(pdf.pages):
   ls=p.extract_text_lines(return_chars=True)
   body=[l for l in ls if l['top']<775]
   lines[name].append([{'text':l['text'],'baseline':p.height-l['chars'][0]['matrix'][5],'top':l['top'],'bottom':l['bottom']}for l in body])
   texts[name].append(''.join(re.sub(r'\s','',l['text'])for l in body))
   for l in body:
    for rid in re.findall(r'REQ\d{4}',l['text']):req[name].append([rid,i+1,round(p.height-l['chars'][0]['matrix'][5],4)])
   images[name].append([(round(x['x0'],4),round(x['top'],4),round(x['width'],4),round(x['height'],4))for x in p.images])
   footer[name].append([l['text']for l in ls if l['top']>=775])
   p.close()
 print('extracted',name,flush=True)
changedText=[i+1 for i,(a,b)in enumerate(zip(texts['control'],texts['C2-combined']))if a!=b]
reqExact=req['control']==req['C2-combined'];imageExact=images['control']==images['C2-combined'];footerExact=footer['control']==footer['C2-combined']
metrics={}
for name in files:
 if name=='Word':continue
 a=lines[name][13];w=lines['Word'][13]
 # Latin/numeric anchors make correspondence inspectable despite native font text extraction differences.
 indexes=[0,4,6,8,11,12,13,14,15,16,17,22,24,26,28,30]
 rows=[]
 for k in indexes:
  assert re.sub('[^A-Za-z0-9]','',a[k]['text'])==re.sub('[^A-Za-z0-9]','',w[k]['text']),(name,k)
  rows.append({'lineIndex':k,'label':re.sub(r'[^A-Za-z0-9 .]','',w[k]['text'])[:70],'deltaPt':a[k]['baseline']-w[k]['baseline']})
 holdout=[r['deltaPt']for r in rows if r['lineIndex']not in [0,11]]
 metrics[name]={'anchors':rows,'holdoutMeanAbsolutePt':statistics.mean(abs(x)for x in holdout),'holdoutMaxAbsolutePt':max(abs(x)for x in holdout),'lastDescriptionLineDeltaPt':a[31]['baseline']-w[31]['baseline'],'lastLineOnPage15':lines[name][14][0]['text'].startswith('รายงาน')}
def anchor_index(name):
 index={}
 for pn,page in enumerate(lines[name][10:26],11):
  for line in page:
   key=re.sub('[^A-Za-z0-9]','',line['text'])
   if len(key)>=8 and re.search('[A-Za-z]{3}',key):index.setdefault(key,[]).append((pn,line['baseline']))
 return {key:items[0]for key,items in index.items()if len(items)==1}
word_index=anchor_index('Word');intro_metrics={}
for name in ['control','C2-combined']:
 index=anchor_index(name);pairs=[(key,index[key],word_index[key])for key in sorted(index.keys()&word_index.keys())]
 same=[(key,a[1]-w[1])for key,a,w in pairs if a[0]==w[0]]
 intro_metrics[name]={'matchedUniqueLatinNumericAnchors':len(pairs),'samePhysicalPage':len(same),'differentPageAnchors':[{'key':key,'candidatePage':a[0],'wordPage':w[0]}for key,a,w in pairs if a[0]!=w[0]],'samePageMeanAbsolutePt':statistics.mean(abs(x)for _,x in same),'samePageMaxAbsolutePt':max(abs(x)for _,x in same),'byPage':{str(pn):{'count':len(ds),'meanAbsolutePt':statistics.mean(abs(x)for x in ds),'maxAbsolutePt':max(abs(x)for x in ds)}for pn in range(11,27)if(ds:=[a[1]-w[1]for key,a,w in pairs if a[0]==w[0]==pn])}}
renders={k:pdfium.PdfDocument(str(files[k]))for k in ['control','Word','C2-combined']}
changedPixels=[]
for i in range(98):
 a=renders['control'][i].render(scale=1).to_pil().convert('RGB');b=renders['C2-combined'][i].render(scale=1).to_pil().convert('RGB')
 if a.tobytes()!=b.tobytes():changedPixels.append(i+1)
 for mode in ['Word','C2-combined']:
  if 10<=i<26:
   page=renders[mode][i].render(scale=1.4).to_pil().convert('RGB');out=D/(mode+'-pages');out.mkdir(exist_ok=True);page.save(out/f'{i+1:03}.png')
print('changed pixel pages',changedPixels,flush=True)
for group in range(4):
 sheet=Image.new('RGB',(1668,1250),'#ddd');draw=ImageDraw.Draw(sheet)
 for j in range(4):
  pn=11+group*4+j
  for col,mode in enumerate(['Word','C2-combined']):
   im=Image.open(D/(mode+'-pages')/f'{pn:03}.png');im.thumbnail((400,580));x=(j%2)*834+col*417;y=(j//2)*625
   sheet.paste(im,(x,y+30));draw.text((x+5,y+5),f'{mode} physical {pn}',fill='black')
 sheet.save(D/f'overview-{group+1}.jpg')
sheet=Image.new('RGB',(2502,1210),'white');draw=ImageDraw.Draw(sheet)
for col,mode in enumerate(['control','Word','C2-combined']):
 im=renders[mode][13].render(scale=1.4).to_pil().convert('RGB');sheet.paste(im,(834*col,28));draw.text((834*col+12,5),mode,fill='black')
sheet.save(D/'page14-comparison.png')
for mode in ['control','Word','C2-combined']:
 im=renders[mode][13].render(scale=3).to_pil().convert('RGB');im.crop((0,220,1786,1030)).save(D/f'{mode}-thai-detail.png')
for p in renders.values():p.close()
frozen=json.loads((D/'frozen-inputs.json').read_text());assert all(sha(Path(x['path']))==x['sha256']for x in frozen)
green=json.loads((D/'green-r2.json').read_text())
old=collections.Counter(''.join(texts['control']));new=collections.Counter(''.join(texts['C2-combined']))
header='บันทึกการประชุมเก็บความต้องการครั้งที่2'
model=json.loads((O/'resolved-document.json').read_text(encoding='utf8'))
source_header_present=any(n.get('type')=='text-block'and collections.Counter(''.join(c.get('text','')for c in n.get('children',[])if c.get('type')=='text').replace(' ',''))==collections.Counter(header)for n in model['nodes'].values())
repeat_accounting={'rawCharacterCountDelta':sum(old.values())-sum(new.values()),'onlyRemovedCharactersEqualOneMeeting2Header':old-new==collections.Counter(header)and not(new-old),'headerExistsInSource':source_header_present,'explanation':'Control paints meeting2 header on17 and repeats it on18; candidate starts meeting2 on18 only. Other repeated header order changes with page cuts. Raw extracted reading order is not identical; this accounting is not complete source glyph identity.'}
result={'inputs':inventory,'page14':metrics,'introductionAnchorMetrics':intro_metrics,'globalExtractedBodyTextExact':''.join(texts['control'])==''.join(texts['C2-combined']),'repeatedHeaderAccounting':repeat_accounting,'changedTextPages':changedText,'changedRasterPages':changedPixels,'requirementOrderPageAndBaselineExact':reqExact,'requirementCount':len(req['control']),'imagePlacementsByPageExact':imageExact,'footersExact':footerExact,'frozenInputsPreserved':True,'tests':{'passed':green['numPassedTests'],'failed':green['numFailedTests']},'scope':'Introduction-only measured profile, calibrated on page14 MOM and heading6. Not general Word metrics or complete document parity.','nativeWordPages':100,'candidatePages':98,'generalRuleAccepted':False}
(D/'comparison-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in result.items()if k not in ['inputs','page14']},ensure_ascii=False,indent=2));print(json.dumps(metrics['C2-combined'],indent=2))
