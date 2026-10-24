"""Pin the reviewed outcome checkpoint without changing any candidate PDF."""
from pathlib import Path
import hashlib,json
D=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24/fidelity-goal-g1')
C=Path(__file__).resolve().parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((D/'comparison-result.json').read_text(encoding='utf8'))
assert len(r['frozenInputs'])==71
assert all(sha(Path(x['path']))==x['sha256'] for x in r['frozenInputs'])
assert r['tests']=={'passed':313,'failed':0}
assert sha(D/'SRS-S3-scoped-font-policy.pdf')==r['factors'][r['selectedFactor']]['sha256']
r['review']={'blockingFindings':0,'independentHelperTests':2,'notes':['96 marker checks comprise 80 treated AtLeast cases and 16 unchanged controls.','Source-text coverage permits repeated whole-text copies and does not establish exact multiplicity.']}
r['visualReview']={'overviewPages':list(range(1,101)),'detailedNativeComparisons':[68,69],'scope':'All pages reviewed in overview sheets; detailed68/69 corroborate repaired wrap and downstream placement. This is not full-resolution every-glyph acceptance.'}
r['proofUse']={'pdfs':12,'srsFactors':4,'fontPackets':8,'extensionReason':'Baseline-only exposed wrapping correctness; global nominal shaping changed protected introduction. Retain both rejected factors and select node-scoped policy.','dockerMemoryBytes':1073741824,'network':'none'}
r['sourceHashes']=[{'path':str(p.relative_to(C)).replace('\\','/'),'sha256':sha(p)} for p in [C/'src/layout/measureText.ts',C/'src/layout/textFlow.ts',C/'tests/layout/fontBaselineProbe.test.ts',*sorted((C/'scripts/experiments').glob('font-*.*')),C/'scripts/experiments/word-spacing-r1.mjs'] if p.name!='font-goal-result.json']
r['outputHashes']=[{'path':str(p),'sha256':sha(p)}for p in sorted(D.rglob('*.pdf'))]
assert len(r['outputHashes'])==12
for p in [D/'comparison-result.json',C/'scripts/experiments/font-goal-result.json']:
 p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('Verified71 frozen inputs;12 candidate PDFs;313 tests; reviewed checkpoint pinned.')
