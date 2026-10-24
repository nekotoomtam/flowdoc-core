"""E11 retain reviewed result with exact artifact and local source hashes."""
from pathlib import Path
import json,hashlib,subprocess
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e11';C=Path(__file__).resolve().parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((D/'comparison-result.json').read_text(encoding='utf8'))
r['frozenInputs']=json.loads((D/'frozen-inputs.json').read_text())
assert all(sha(Path(x['path']))==x['sha256'] for x in r['frozenInputs'])
assert r['tests']['failed']==0 and r['controlByteExactE9'] and r['raster']['protected11to26ContentExact']
allowed={'src/layout/textFlow.ts','src/layout/cellTableFlow.ts','src/layout/tableStart.ts','tests/layout/paragraphWidowProbe.test.ts','scripts/experiments/word-spacing-r1.mjs','scripts/experiments/word-widow-prepare.py','scripts/experiments/word-widow-audit.py','scripts/experiments/word-widow-finalize.py','scripts/experiments/word-widow-result.json'}
status=subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=C,text=True)
changed={line[3:] for line in status.splitlines()};assert changed<=allowed,changed-allowed
r['artifacts']=[{'path':str(p),'sha256':sha(p)} for p in [D/'SRS-V0-E9-control.pdf',D/'SRS-V1-paragraph-minimum.pdf',D/'calibration.json',D/'green.json',D/'V1-paragraph-minimum-draw.json']]
r['sourceFiles']=[{'path':p,'sha256':sha(C/p)} for p in sorted(allowed) if (C/p).exists() and not p.endswith('-result.json')]
r['review']={'critical':0,'importantInFrozenScope':0,'minorFixed':'Pin all three consumed E10 geometry/feature caches in frozen-input inventory.','scope':'Frozen26 ordinary unmerged native body tables, no rowGroups; no default promotion.','expansionLimitation':'Heading+table preflight can reject when heading plus requested paragraph minimum exceeds fresh-page capacity (54pt page,18pt heading,3x18pt lines); low-level row relaxation does not relax that existing group constraint. Must address before generalized promotion.'}
r['visualReview']={'overviewSheets':9,'pagesCovered':100,'detailedSamePagePairs':[14,49,53,58,82,100],'newClippingObserved':False,'remainingVisibleDifferences':'Some paragraph line wrapping/spacing still differs from native; image-only continuation at82 is visible. Equal total pages and357 aligned REQ starts are not full layout/glyph parity.'}
r['auditCorrection']='Selected text-block IDs, not cell-level buckets, decide singleton paragraph ends. E10 native line buckets around REQ0083 include subsequent empty-table placeholder; no new global line-count claim from those locators.'
(D/'comparison-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
(C/'scripts/experiments/word-widow-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'candidate':r['artifacts'][1],'pages':r['pages'],'requirements':r['requirements'],'tests':r['tests'],'scopePaths':sorted(changed)},indent=2))
