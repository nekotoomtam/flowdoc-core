"""E12 exact source/artifact inventory and reviewed acceptance scope."""
from pathlib import Path
import json,hashlib,subprocess
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e12';C=Path(__file__).resolve().parents[2]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
r=json.loads((D/'comparison-result.json').read_text(encoding='utf8'));cal=json.loads((D/'calibration.json').read_text(encoding='utf8'))
assert all(sha(Path(x['path']))==x['sha256'] for x in r['frozenInputs'])
selected=r['factors'][r['selectedFactor']];assert selected['requirements']['sameWordPage']==361 and not selected['requirements']['regressionsAgainstE11']
assert r['tests']['failed']==0 and r['raster']['protected11to26ContentExact'] and not r['raster']['footerChangedPages']
allowed={'src/layout/cellTableFlow.ts','tests/layout/paragraphWidowProbe.test.ts','scripts/experiments/word-spacing-r1.mjs','scripts/experiments/word-top-prepare.py','scripts/experiments/word-top-audit.py','scripts/experiments/word-top-finalize.py','scripts/experiments/word-top-result.json'}
status=subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=C,text=True);changed={line[3:] for line in status.splitlines()};assert changed<=allowed,changed-allowed
r['selectedBodyTopPt']=cal['nativeBodyStart']['bodyTopPt']+cal['nativeBodyStart']['tableStrokePt']/2
r['sourceFiles']=[{'path':p,'sha256':sha(C/p)} for p in sorted(allowed) if (C/p).exists() and not p.endswith('-result.json')]
r['artifacts']=[{'path':str(p),'sha256':sha(p)} for p in [D/('SRS-'+r['selectedFactor']+'.pdf'),D/(r['selectedFactor']+'-draw.json'),D/'calibration.json',D/'green-padding.json',D/'red-padding.json',D/'plan.json']]
r['visualReview']={'overviewSheets':9,'pagesCovered':100,'detailedSamePagePairs':[53,82,84,86,88,100],'newClippingObserved':False,'scope':'Full page overviews and selected detailed native comparisons; not every glyph at high resolution. Introduction11-26 retained through pixel equality.'}
r['codeReview']={'critical':0,'important':0,'scope':'Current opt-in paragraph cut, ordinary unmerged native SRS tables; frozen source/evidence audit. No default/general font acceptance.','existingOutOfScopeLimitation':'Heading plus requested paragraph minimum can exceed fresh-page capacity and fail existing preflight; rowGroups and merged-cell extensions are not accepted.'}
r['proofBudgetDisposition']='Six complete PDF factors retained: four source-derived top probes, then two corrective factors after a padded regression proved an E11 cut correctness defect. All offline1GiB. No discarded/overwritten baseline or hidden forced REQ break.'
(D/'comparison-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8');(C/'scripts/experiments/word-top-result.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'selected':r['artifacts'][0],'requirements':selected['requirements'],'pages':r['pages'],'tests':r['tests'],'frozenInputs':len(r['frozenInputs']),'scopePaths':sorted(changed)},indent=2))
