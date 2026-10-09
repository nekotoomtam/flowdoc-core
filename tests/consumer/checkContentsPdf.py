# Repository-owned proof helper; requires the caller's pypdf runtime, not a Core dependency.
import json,re,sys
from pathlib import Path
from pypdf import PdfReader
out=Path(sys.argv[1]);results=[]
for pdf in sorted(out.glob('contents-*.pdf')):
 r=PdfReader(pdf);texts=[];page_ids={p.indirect_reference.idnum:i for i,p in enumerate(r.pages)}
 for i,p in enumerate(r.pages):
  runs=[]
  def visitor(text,cm,tm,font,size):
   if text.strip():runs.append((text.strip(),float(tm[4]),float(tm[5]),float(size)))
  p.extract_text(visitor_text=visitor);texts.append(runs)
  footers=[t for t in runs if t[3]==10]
  assert len(footers)==1 and footers[0][0]==str(i+1),(pdf,i,footers)
  assert footers[0][1]>float(p.mediabox.width)-100 and 0<footers[0][2]<40
 first_headings={}
 for i,p in enumerate(r.pages):
  rectangles=[list(map(float,a.get_object()['/Rect'])) for a in p.get('/Annots',[])]
  for t in texts[i]:
   if re.match(r'H\d{3}',t[0]) and not any(a[0]-.01<=t[1]<=a[2]+.01 and a[1]-.01<=t[2]<=a[3]+.01 for a in rectangles):first_headings.setdefault(t[0][:4],(i,t[1],t[2]))
 numbers=0;links=0
 for i,p in enumerate(r.pages):
  for ref in p.get('/Annots',[]):
   a=ref.get_object();dest=a.get('/Dest')
   if not dest:continue
   links+=1;target=page_ids[dest[0].idnum];x,y=float(dest[2]),float(dest[3])
   heading=[t for t in texts[target] if abs(t[1]-x)<.02 and 0<=y-t[2]<=18.01]
   assert heading and re.match(r'H\d{3}',heading[0][0]),(pdf,i,dest,heading)
   assert first_headings[heading[0][0][:4]]==(target,heading[0][1],heading[0][2]),(pdf,'Not first occurrence')
   rect=list(map(float,a['/Rect']));inside=[t for t in texts[i] if rect[0]-.01<=t[1]<=rect[2]+.01 and rect[1]-.01<=t[2]<=rect[3]+.01]
   assert inside,(pdf,i,rect)
   if rect[0]>450:
    assert len(inside)==1 and inside[0][0]==str(target+1),(pdf,i,inside,target)
    numbers+=1
   elif re.match(r'H\d{3}',inside[0][0]):assert inside[0][0][:4]==heading[0][0][:4]
 expected=next(x['entries'] for x in json.loads((out/'contents-result.json').read_text())['results'] if pdf.stem=='contents-'+x['name'])
 assert numbers==expected,(pdf,numbers,expected)
 results.append({'file':pdf.name,'pages':len(r.pages),'verifiedNumbers':numbers,'verifiedDestinations':links})
report={'status':'PASS','checks':'Actual PDF text at annotation rectangles; numbers equal referenced physical pages; destinations land at first heading line; footer text and placement','results':results}
(out/'contents-pdf-verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
