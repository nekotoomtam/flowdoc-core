from pathlib import Path
import json,hashlib,zipfile,xml.etree.ElementTree as E
import pdfplumber
O=Path(r'C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'spacing-e4'
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
word=O/'spacing-e3/SRS-spacing-D-cell-baseline.pdf';docx=O/'spacing-e3/SRS-spacing-D-cell-baseline.docx'
with pdfplumber.open(word)as p:
 page=p.pages[13];lines=page.extract_text_lines(return_chars=True)
 baseline=lambda l:page.height-l['chars'][0]['matrix'][5]
 edges=sorted(set((r['top']+r['bottom'])/2 for r in page.rects if r['width']>400 and r['top']<330))
 top=edges[0];bottom=edges[-1];body=baseline(lines[0])-top-3
 heading=baseline(lines[11])-bottom
 imageBottom=max(i['bottom']for i in page.images if i['top']<1)
with zipfile.ZipFile(docx)as z:
 root=E.fromstring(z.read('word/document.xml'));sect=list(root.iter(W+'sectPr'))[5];margin=sect.find(W+'pgMar');xmlTop=int(margin.get(W+'top'))/20
 guided=[e.get('sourceNodeId')for e in E.fromstring(z.read('customXml/flowdoc-paragraphs.xml')).findall('paragraph')]
cal={'authority':'Measured artifact probe, not a general font-derived Word rule','calibrationPage':14,'calibrationAnchors':['MOM first line relative to its row','heading6 relative to preceding table bottom'],'evaluation':'Remaining page14 lines plus pages11-26; body sections remain outside profile',
 'tableTopPt':top,'strokePt':.5,'sourceGuidedNodeIds':guided,'lineProfiles':{'normal:11:19.84':{'heightPt':19.85,'baselineOffsetPt':body},'bold:13:24':{'heightPt':24,'baselineOffsetPt':heading}},
 'header':{'paintedImageBottomPt':imageBottom,'nativeSectionTopPt':xmlTop,'nativeTableBorderCenterPt':top,'paintedGapPt':top-imageBottom,'sourceImageHeightPt':24.324324324324323*72/25.4,'sourceGapPt':12,'structuralReservationExtraPt':2,'decision':'Retain DOCX and its83pt reservation. Painted bounds do not prove the native paragraph footprint; do not remove2pt or modify the original document.'}}
frozen=[]
for path in [O/'inputs/original-reference.pdf',O/'SpaceShip-SRS-trial.pdf',word,docx,O/'resolved-document.json',O/'image-provider.json']:
 b=path.read_bytes();frozen.append({'path':str(path),'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
(D/'calibration.json').write_text(json.dumps(cal,indent=2),encoding='utf8');(D/'frozen-inputs.json').write_text(json.dumps(frozen,indent=2),encoding='utf8')
print(json.dumps(cal,indent=2))
