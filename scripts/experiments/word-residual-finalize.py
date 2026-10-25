"""Verify bounded E10 diagnosis and preserve the unmodified candidate."""
from pathlib import Path
import json,hashlib,subprocess
O=Path('C:/Users/nekot/Documents/FlowDoc-recovery/srs-real-2026-10-24');D=O/'pagination-e10';C=Path(__file__).resolve().parents[2]
r=json.loads((D/'diagnosis.json').read_text(encoding='utf8'));counts=r['counts']
assert (counts['requirements'],counts['samePage'],counts['onePageEarly'],counts['mismatchRunsInSourceOrder'])==(361,304,57,33)
assert sum(len(g['ids']) for g in r['groupDetails'])==57
assert len({id for g in r['groupDetails'] for id in g['ids']})==57
assert len(r['rowMetrics'])==361
assert all(g['nativeRowSplittable'] and g['nativeKeepLinesAllFalse'] and g['nativeWidowControlUnspecified'] for g in r['groupDetails'])
assert len(r['fragmentInventory']['PDF']['singletonEndParagraphs'])==9 and not r['fragmentInventory']['Word']['singletonEndParagraphs']
assert counts['featureLineCountDeltaDistribution']=={'0':360,'-1':1}
assert [x['id'] for x in r['rowMetrics'] if x['lineCountDelta']]==['REQ0178']
assert len(r['anonymousNoteRowsSeparated'])==len(r['separateDiacriticExtractionFragments'])==2
assert all(hashlib.sha256(Path(x['path']).read_bytes()).hexdigest()==x['sha256'] for x in r['frozenInputs'])
status=subprocess.check_output(['git','status','--porcelain','--untracked-files=all'],cwd=C,text=True).splitlines()
allowed={'scripts/experiments/word-residual-'+n for n in ['scan.py','analyze.py','views.py','finalize.py','result.json']}
assert all(line[3:].replace('\\','/') in allowed for line in status),status
r['validation']={'frozenHashesUnchanged':True,'trackedCandidateAndNonIgnoredFilesUnchangedOutsideDiagnosticTools':True,'requirementGroupsCoverAll57ExactlyOnce':True,'nativeSelectedRowsSplittableAndNoKeepLines':True,'priorCandidate':'0c13e0c','runtimeTestsRerun':False,'reason':'Complete Git status contains diagnostic tools only; frozen hashes match. No runtime execution in this checkpoint; no claim to inspect every ignored runtime artifact.'}
r['visualReview']={'sheets':['first-divergence.png','long-row-end.png','singleton-last.png','wrap-0178.png','wrap-0346.png','wrap-0365.png'],'scope':'Frozen representative cause comparisons; full-document text geometry scanned, not new full-page visual acceptance.'}
r['nextExperiment']={'primary':'Opt-in PDF paragraph widow/orphan policy using actual native paragraph boundaries; at least two text lines at a paragraph beginning/end when feasible. Long rows still split; oversize fallback must ensure progress.','containment':'Keep E9 bottom, E8 row metrics, E7 grouping and introduction profile unchanged; compare byte-exact control and one factor against all361REQ, source coverage and protected pages.','secondary':'Keep REQ0178 native/PDF wrap difference separate; it reduces native line count and does not explain earlier PDF starts.','notYetProven':'The exact number of the57 page starts or final page count recovered by the widow/orphan factor needs a real reflow counterfactual.'}
r['reviewCorrections']=['REQ0365 mark check now renders physical99 where its native fragment actually occurs.','Candidate containment checks complete Git status against explicit diagnostic-file allowlist, not four directory prefixes.']
(D/'diagnosis.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf8')
compact={k:v for k,v in r.items() if k not in ['rowMetrics','anonymousNoteRowsSeparated','firstDivergence']}
compact['firstDivergence']={'id':'REQ0027','pdfFragments':[[48,1],[49,1]],'nativeFragments':[[49,2]],'paragraphKeepNext':False,'paragraphKeepLines':False,'widowControl':'unspecified at paragraph and default style levels; standard default enabled'}
(C/'scripts/experiments/word-residual-result.json').write_text(json.dumps(compact,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('E10 assertions pass; all57 mapped; source and frozen artifacts unchanged')
