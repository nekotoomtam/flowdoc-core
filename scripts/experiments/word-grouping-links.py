"""Supplement frozen E7 output with destination bounds and calibration checks."""
from pathlib import Path
import json
from pypdf import PdfReader

O = Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24')
D = O / 'pagination-e7'
r = json.loads((D / 'comparison-result.json').read_text(encoding='utf8'))
old = json.loads((O / 'spacing-e5/calibration.json').read_text(encoding='utf8'))
new = json.loads((D / 'calibration.json').read_text(encoding='utf8'))
for key in ['nativeKeepNextHeadingIds', 'groupingAuthority']:
    new.pop(key)
assert old == new
reader = PdfReader(D / 'SRS-G1-table-start.pdf')
refs = {p.indirect_reference.idnum for p in reader.pages}
names = reader.named_destinations
bad = []
checked = 0
for name, dest in names.items():
    pn = reader.get_destination_page_number(dest)
    if pn is None or not 0 <= pn < len(reader.pages):
        bad.append({'name': name, 'page': pn})
for pn, page in enumerate(reader.pages, 1):
    for ref in page.get('/Annots', []):
        a = ref.get_object()
        action = a.get('/A', {})
        if hasattr(action, 'get_object'):
            action = action.get_object()
        dest = a.get('/Dest')
        if dest is None and action.get('/S') == '/GoTo':
            dest = action.get('/D')
        if dest is None:
            continue
        checked += 1
        if isinstance(dest, (str, bytes)):
            valid = dest in names
        else:
            first = dest[0]
            valid = first.idnum in refs if hasattr(first, 'idnum') else isinstance(first, int) and 0 <= first < len(reader.pages)
        if not valid:
            bad.append({'annotationPage': pn, 'destination': str(dest)})
assert not bad, bad
model = json.loads((O / 'resolved-document.json').read_text(encoding='utf8'))
plain = {id for id, n in model['nodes'].items() if n['type'] == 'text-block' and all(c['type'] in ['text', 'line-break'] for c in n['children'])}
r['plainSourceTextMetricsChanges'] = [id for id in r['sourceLineMetricsChanges'] if id in plain]
assert not r['plainSourceTextMetricsChanges']
r['inheritedCalibrationExact'] = True
r['internalLinks'] = {'annotationsChecked': checked, 'namedDestinationsChecked': len(names), 'invalid': bad, 'scope': 'Destination existence and page bounds, not complete semantic target identity.'}
r['visualReview'] = {'bodyPages': '27-99 at overview scale', 'detailedPairs': ['27/27', '45/45', '46/46', '99/100'], 'newVisibleClippingObserved': False, 'scope': 'Overview plus selected detailed pairs; not every glyph at high resolution.'}
assert all(r['first26Pages'][str(p)]['aboveFooterExact'] for p in range(11, 27))
(D / 'comparison-result.json').write_text(json.dumps(r, ensure_ascii=False, indent=2), encoding='utf8')
compact = {k: v for k, v in r.items() if k not in ['headings', 'first26Pages']}
(Path(__file__).parent / 'word-grouping-result.json').write_text(json.dumps(compact, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'links': r['internalLinks'], 'inheritedCalibrationExact': True, 'plainSourceTextMetricsChanges': []}, indent=2))
