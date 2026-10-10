"""Read-only acceptance assertions for the packed model16 consumer PDFs."""
import re
import sys
from pathlib import Path
from pypdf import PdfReader

root = Path(sys.argv[1])
for name in ('long', 'no-contents', 'no-fields', 'repeated'):
    reader = PdfReader(root / f'page-numbering-{name}.pdf')
    texts = [page.extract_text() for page in reader.pages]
    assert len(texts) == (11 if name == 'no-contents' else 12), name
    assert all('system-page-field' not in text and '9999' not in text for text in texts)
    assert not re.search(r'\d', texts[0]), 'cover must have no page fields'
    assert texts[-4].strip() == '', 'blank page must have no bands'
    if name != 'no-fields':
        assert 'หน้า' not in texts[-3] and ' จาก ' not in texts[-3], 'hide whole block'
    if name == 'no-fields':
        assert texts[-1].rstrip().endswith('END-OF-BOOK'), 'no automatic footer'
    else:
        total = 9 if name == 'no-contents' else 10
        last = 104 if name == 'repeated' else 1
        assert re.search(rf'\b{last}\s+{total}\s*$', texts[-1]), (name, texts[-1])
        assert re.search(rf'\b{total}\s*$', texts[-2]), 'total on excluded page'
        start = 1 if name == 'no-contents' else 2
        for offset in range(6):
            assert re.search(rf'\b{99+offset}\s+{total}\s*$', texts[start+offset])
    if name != 'no-contents':
        refs = {page.indirect_reference.idnum: i for i, page in enumerate(reader.pages)}
        destinations = [refs[a.get_object()['/Dest'][0].idnum]
                        for a in reader.pages[1]['/Annots']]
        assert destinations == [7, 11, 7, 11], destinations
        if name == 'repeated':
            assert re.search(r'104\s+104\s+1\s+10\s*$', texts[1]), texts[1]
print('PASS: counted values, hidden/blank/cover, no automatic fields, physical TOC destinations')
