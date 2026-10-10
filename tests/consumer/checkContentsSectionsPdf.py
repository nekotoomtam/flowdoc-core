"""Check actual PDF destinations and counted labels; pypdf is a test dependency."""
import json
import re
import sys
from pathlib import Path
from pypdf import PdfReader

root = Path(sys.argv[1])
results = []
for name, count in [('short', 3), ('long', 70)]:
    reader = PdfReader(root / f'contents-sections-{name}.pdf')
    page_ids = {p.indirect_reference.idnum: i for i, p in enumerate(reader.pages)}
    text = [p.extract_text() for p in reader.pages]
    toc_pages = [i for i, t in enumerate(text) if t.startswith('HEADER contents')]
    body_pages = [i for i, t in enumerate(text) if t.startswith('HEADER body')]
    hidden = next(i for i, t in enumerate(text) if t.startswith('HIDDEN NUMBERS'))
    excluded = next(i for i, t in enumerate(text) if t.startswith('EXCLUDED'))
    closing = len(text)-1
    assert len(toc_pages) == (1 if name == 'short' else 3)
    runs = []
    for page in reader.pages:
        page_runs = []
        def visit(t, cm, tm, font, size):
            if t.strip():
                page_runs.append((t.strip(), float(tm[4]), float(tm[5])))
        page.extract_text(visitor_text=visit)
        runs.append(page_runs)
    numbers = 0
    title_targets = []
    first_headings = {}
    for i in body_pages+[hidden, excluded, closing]:
        for t, x, y in runs[i]:
            match = re.match(r'H\d{3}', t)
            if match:
                first_headings.setdefault(match[0], (i, x, y))
    for i in toc_pages:
        for ref in reader.pages[i].get('/Annots', []):
            annotation = ref.get_object()
            dest = annotation.get('/Dest')
            if not dest:
                continue
            target = page_ids[dest[0].idnum]
            dx, dy = float(dest[2]), float(dest[3])
            at = [r for r in runs[target] if abs(r[1]-dx)<.02 and 0 <= dy-r[2] <= 23]
            assert at, (name, target, dest)
            label = re.match(r'H\d{3}', at[0][0])
            if label:
                assert first_headings[label[0]] == (target, at[0][1], at[0][2]), 'not first occurrence'
            rect = list(map(float, annotation['/Rect']))
            inside = [r for r in runs[i] if rect[0]-.02<=r[1]<=rect[2]+.02 and rect[1]-.02<=r[2]<=rect[3]+.02]
            assert inside, (name, i, rect)
            if rect[0] > float(reader.pages[i].mediabox.width)-20*72/25.4-36-1:
                assert target != excluded, 'excluded page has number link'
                expected = 1 if target == closing else target-body_pages[0]+1
                assert len(inside)==1 and inside[0][0]==str(expected), (name, target, inside, expected)
                numbers += 1
            else:
                title_targets.append(target)
                if re.match(r'H\d{3}', inside[0][0]):
                    assert inside[0][0][:4] == at[0][0][:4]
    assert numbers == count+5, (name, numbers)
    assert excluded in title_targets and hidden in title_targets and closing in title_targets
    assert title_targets.count(first_headings['H001'][0]) > 1, 'wrapped title links missing'
    results.append({'name':name,'pages':len(reader.pages),'tocPages':len(toc_pages),'numberLinks':numbers,'titleLinks':len(title_targets)})
print(json.dumps({'status':'PASS','results':results}))
