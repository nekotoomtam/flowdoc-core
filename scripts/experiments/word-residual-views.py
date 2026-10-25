"""Render only frozen diagnostic comparisons; no PDF authoring."""
from pathlib import Path
import json
import pypdfium2 as pdfium
from PIL import Image,ImageDraw
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e10'
docs={'PDF':pdfium.PdfDocument(str(O/'pagination-e9/SRS-F1-native-bottom.pdf')),'Word':pdfium.PdfDocument(str(O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf'))}
for label,pages in [('first-divergence',[48,49]),('long-row-end',[52,53]),('singleton-last',[57,58])]:
 sheet=Image.new('RGB',(1680,1210),'#ddd');draw=ImageDraw.Draw(sheet)
 for row,pn in enumerate(pages):
  for col,name in enumerate(['PDF','Word']):
   im=docs[name][pn-1].render(scale=1).to_pil().convert('RGB')
   lo,hi=(500,775) if row==0 else (75,350)
   im=im.crop((20,lo,575,hi)).resize((820,407));sheet.paste(im,(840*col,600*row+30));draw.text((840*col+8,600*row+8),f'{name} physical{pn}, y{lo}-{hi}',fill='black')
 sheet.save(D/(label+'.png'))
for label,pn in [('wrap-0178',68),('wrap-0346',95),('wrap-0365',99)]:
 sheet=Image.new('RGB',(1668,1210),'white');draw=ImageDraw.Draw(sheet)
 for col,name in enumerate(['PDF','Word']):sheet.paste(docs[name][pn-1].render(scale=1.4).to_pil().convert('RGB'),(834*col,28));draw.text((834*col+8,5),name+' physical'+str(pn),fill='black')
 sheet.save(D/(label+'.png'))
for doc in docs.values():doc.close()
print('Six frozen visual comparison sheets rendered')
