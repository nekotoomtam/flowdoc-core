import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,isAbsolute} from 'node:path';
import {NativeShapeSession} from '../runtime/nativeShapeSession.js';
import {intentResourceBytes,requireGenuineIntent} from './profile.js';
import {sourceGraph} from './fields.js';
import {fail,type ExportIntent} from './types.js';
import {deriveMetricPairs,neutralMetricPairs,unwrappedAdvancePt} from './metric-pairs.js';
import {concreteFontBounds} from './font-envelope.js';
import {toPoints,toTwips} from './units.js';

// Calibration boundary, not an OOXML guarantee: Sarabun's four bundled faces,
// Word16.0.20430.20182, sizes8/12/18 at1.5 lines and12pt at these frame heights.
const faces=new Set([
 'b8150084e25734e6f31696c57ff009f5564efa09d295848b717d9e2328c0311d',
 '5d1fc1ee63ab861fb2022a212b5ff270848582bb9d9cba73b2d2aaabb16d0a18',
 'fb86138e0cf99786db40715a84df51508766371e2f1f2822faf22cba6563acc7',
 'a497ef98fad371e04bc64076b213da00c05a84881494ee36a4c61922c65ff7ef',
]);
export interface BaselineDecision {
 kind:'text-baseline-policy';nodeId:string;scope:string;fontSha256:string;
 policy:'font-metric-exact'|'retain-native';reason:string;wordVerified:false;
 sourceBaselinePt?:number;nativeBaselinePt?:number;positionHalfPoints?:number;
 sourceBaselineMinPt?:number;sourceBaselineMaxPt?:number;
 sourceInkAscentPt?:number;sourceInkDescentPt?:number;
 upperHeadroomPt?:number;lowerHeadroomPt?:number;
 maxUnwrappedWidthPt?:number;
 maxTokenEnvelopePt?:number;tokenAvailableWidthPt?:number;
}
const proofs=new WeakMap<ExportIntent,ReadonlyMap<string,Readonly<BaselineDecision>>>();
const pairProofs=new WeakMap<ExportIntent,ReadonlyMap<string,ReadonlyMap<number,number>>>();
interface ThaiWordGroups{readonly ends:readonly number[];readonly words:number;}
const thaiWords=new WeakMap<ExportIntent,ReadonlyMap<string,Readonly<ThaiWordGroups>>>();
const tableWidths=new WeakMap<ExportIntent,ReadonlySet<string>>();
const key=(scope:string,id:string)=>JSON.stringify([scope,id]);
export function baselineDecision(intent:ExportIntent,scope:string,id:string){
 requireGenuineIntent(intent);return proofs.get(intent)?.get(key(scope,id));
}
export function thaiWordBoundaries(intent:ExportIntent,scope:string,id:string){
 requireGenuineIntent(intent);return thaiWords.get(intent)?.get(key(scope,id))?.ends;
}
export function baselineReceipts(intent:ExportIntent){
 requireGenuineIntent(intent);return [...(proofs.get(intent)?.values()??[]),
  ...[...(thaiWords.get(intent)?.entries()??[])].map(([id,groups])=>{
   const baseline=proofs.get(intent)!.get(id)!;
   return {kind:'thai-word-boundary-policy',scope:baseline.scope,nodeId:baseline.nodeId,fontSha256:baseline.fontSha256,
    policy:'alternating-native-zero-spacing',words:groups.words,groups:groups.ends.length,maxWordsPerGroup:4,reason:'bounded-source-cluster-word-boundaries',wordVerified:false};
  }),
  ...[...(pairProofs.get(intent)?.entries()??[])].map(([id,pairs])=>{
   const baseline=proofs.get(intent)!.get(id)!;
   return {kind:'font-metric-pair-spacing',scope:baseline.scope,nodeId:baseline.nodeId,
    fontSha256:baseline.fontSha256,pairs:pairs.size,perPairQuantizationPt:.025,
    reason:'bounded-one-to-one-ascii-source-advance',
    widthPolicy:baseline.maxUnwrappedWidthPt!==undefined?'source-advance':baseline.maxTokenEnvelopePt!==undefined?'bounded-token-source-advance':'preserve-ascii-word-advance',wordVerified:false};
  })];
}
export function pairSpacingAt(intent:ExportIntent,scope:string,id:string,offset:number){
 requireGenuineIntent(intent);return pairProofs.get(intent)?.get(key(scope,id))?.get(offset);
}
export function tableWidthProven(intent:ExportIntent,id:string){requireGenuineIntent(intent);return tableWidths.get(intent)?.has(id)===true;}
/** Optional source-shaper bound. It never imports PDF layout or decides wrapping.
 * Unproved cases keep native minimum spacing. Only owned, hash-pinned font bytes
 * are opened by the helper; no caller-supplied safety flag can authorize Exact.
 */
export async function prepareMetricBaselines(intent:ExportIntent,shaperPath:string,signal?:AbortSignal,skip?:(scope:string,nodeId:string)=>boolean){
 requireGenuineIntent(intent);
 if(!isAbsolute(shaperPath))return;
 const decisions=new Map<string,Readonly<BaselineDecision>>();
 const wordsByBlock=new Map<string,Readonly<ThaiWordGroups>>();
 const pairsByBlock=new Map<string,ReadonlyMap<number,number>>();
 const sessions=new Map<string,NativeShapeSession>();
 let directory:string|undefined,remaining=32768,requests=0;
 const abort=()=>{for(const session of sessions.values())void session.close().catch(()=>{});};
 const cancelled=()=>{if(signal?.aborted)fail('DOCX_CANCELLED','options.signal','Export cancelled during font metrics');};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  cancelled();
  for(const block of intent.textBlocks){
   cancelled();
   if(skip?.(block.scope,block.nodeId))continue;
   const style=intent.styles[block.styleId]!,node:any=sourceGraph(intent,block.scope)[block.nodeId];
   const decision:BaselineDecision={kind:'text-baseline-policy',nodeId:block.nodeId,scope:block.scope,
    fontSha256:style.font.sha256,policy:'retain-native',reason:'unverified-content',wordVerified:false};
   const retain=(reason:string)=>{decision.reason=reason;decisions.set(key(block.scope,block.nodeId),Object.freeze(decision));};
   const size=style.sizeHalfPoints/2,height=style.line.twips/20;
   const band=block.scope!=='nodes',hasPageFields=block.spans.some(s=>s.type==='system-page-field');
   if(node.props.heightMode==='fixed'||hasPageFields&&(!band||node.props.pageFieldLayout!=='compact')||band&&block.spans.some(s=>s.type!=='text'&&s.type!=='system-page-field')){retain('fixed-or-unbounded-generated-content');continue;}
   if(!block.text.trim()||block.text.split('\n').some(line=>!line.trim())){retain('empty-authored-line');continue;}
   if(!faces.has(style.font.sha256)||![8,12,18].includes(size)||
       !(Math.abs(height-size*1.5)<1e-6||size===12&&[15.6,16,18,20,24,30].includes(height))){retain('outside-calibrated-font-frame');continue;}
   if(!/^[\u0020-\u007e\u0e00-\u0e7f\n]+$/u.test(block.text)){retain('outside-calibrated-script');continue;}
   if(block.text.length>4096||block.text.length>remaining||requests>=256){retain('metric-proof-budget');continue;}
   remaining-=block.text.length;
   try{
    let session=sessions.get(style.font.id);
    if(!session){
     directory??=await mkdtemp(join(tmpdir(),'flowdoc-docx-metrics-'));
     // Both filename and directory are owned; font IDs never become paths.
     const file=join(directory,'font-'+sessions.size+'.ttf');
     await writeFile(file,intentResourceBytes(intent,'font',style.font.id),{flag:'wx',mode:0o600});
     session=new NativeShapeSession(shaperPath,['--serve',file,style.font.id]);sessions.set(style.font.id,session);
    }
    let above=0,below=0,lineStart=0,maxWidth=0,wholeRaw:any;const pairs=new Map<number,number>(),neutral=new Map<number,number>();
    for(const text of block.text.split('\n')){
     // Also shape isolated grapheme clusters. Wrapping must not split a cluster;
     // both contexts contribute to the conservative source-baseline interval.
     const isolated=[...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)].map(g=>g.segment).join(' ');
     // Native compact page fields retain their real field instructions. Every
     // possible decimal glyph contributes to baseline/ink safety, never to
     // authored text or static-span offset calculations.
     for(const sample of [text,isolated,...(hasPageFields?['0123456789']:[])]){
      if(++requests>256)throw Error('Metric request budget');
      const raw=await session.request(sample);cancelled();
      if(raw.text!==sample||raw.fontId!==style.font.id||raw.shaperRevision!=='rustybuzz-0.20.1'||
          raw.unitsPerEm!==1000||raw.ascent!==1068||raw.descent!==-232||!Array.isArray(raw.glyphs)||!raw.glyphs.length)throw Error('Unbound font metrics');
      for(const g of raw.glyphs){
       if(!Number.isInteger(g.glyphId)||g.glyphId<=0||![g.xAdvance,g.yAdvance,g.xOffset,g.yOffset].every(Number.isFinite)||g.yAdvance!==0)throw Error('Invalid metric glyph');
       if(g.ink!==null){
        if(!g.ink||![g.ink.yMin,g.ink.yMax].every(Number.isFinite)||g.ink.yMin>g.ink.yMax)throw Error('Invalid metric ink');
        above=Math.max(above,g.yOffset+g.ink.yMax);below=Math.max(below,-g.yOffset-g.ink.yMin);
       }
      }
      if(sample===text){if(lineStart===0)wholeRaw=raw;const fontBytes=intentResourceBytes(intent,'font',style.font.id);
       maxWidth=Math.max(maxWidth,unwrappedAdvancePt(raw,fontBytes,size));
       for(const [offset,spacing] of deriveMetricPairs(text,raw,fontBytes,size)){
       const at=lineStart+offset;
       if(block.spans.some(s=>s.type==='text'&&at>=s.range[0]&&at+1<s.range[1]))pairs.set(at,spacing);
       }
       for(const [offset,spacing] of neutralMetricPairs(text,raw,fontBytes,size)){
        const at=lineStart+offset,word=[...text.matchAll(/[A-Za-z]+/g)].find(m=>offset>=m.index&&offset<m.index+m[0].length)!;
        if(block.spans.some(s=>s.type==='text'&&lineStart+word.index>=s.range[0]&&lineStart+word.index+word[0].length<=s.range[1]))neutral.set(at,spacing);
       }
      }
     }
     lineStart+=text.length+1;
    }
    const fontAscent=1068*size/1000,fontDescent=232*size/1000;
    const ascent=Math.max(1068,above)*size/1000,descent=Math.max(232,below)*size/1000;
    Object.assign(decision,{sourceInkAscentPt:ascent,sourceInkDescentPt:descent,...(Number.isFinite(maxWidth)?{maxUnwrappedWidthPt:maxWidth}:{})});
    if(ascent+descent>height+1e-6){retain('ink-exceeds-line-frame');continue;}
    // Wrapped lines can contain different descenders/marks. Bound that source
    // variation instead of pretending a paragraph-wide maximum is every line.
    const sourceMin=(height+fontAscent-descent)/2,sourceMax=(height+ascent-fontDescent)/2;
    Object.assign(decision,{sourceBaselineMinPt:sourceMin,sourceBaselineMaxPt:sourceMax});
    // At most one native half-point rounding error of interval uncertainty;
    // midpoint minimizes worst-case distance within the measured source bound.
    if(sourceMax-sourceMin>.25+1e-6){
     // Native Thai placement is sensitive to effective run boundaries even when
     // the requested spacing is zero. Bound this experiment to the measured
     // Regular12pt/18pt native fallback; do not change Exact or mixed text.
     const section=(intent.document.sections as any[]).find(s=>s.rootIds.includes(block.nodeId));
     if(section&&style.font.sha256==='b8150084e25734e6f31696c57ff009f5564efa09d295848b717d9e2328c0311d'&&size===12&&height===18&&
         /^[\u0e01-\u0e3a\u0e40-\u0e4e]+$/u.test(block.text)&&block.spans.length===1&&block.spans[0]!.type==='text'&&
         block.spans[0]!.range[0]===0&&block.spans[0]!.range[1]===block.text.length){
      const words=[...new Intl.Segmenter('th',{granularity:'word'}).segment(block.text)];
      const graphemes=new Set([...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(block.text)].map(g=>g.index));
      const clusters=new Set(wholeRaw.glyphs.map((g:any)=>g.cluster));
      const boundaries=words.map(g=>g.index);
      const page=section.page,pw=(page.orientation==='portrait'?210:297)*72/25.4;
      const available=Math.min(pw-toPoints(page.margin.left)-toPoints(page.margin.right),
       (Math.round(pw*20)-toTwips(page.margin.left)-toTwips(page.margin.right))/20)-1.5;
      const envelope=concreteFontBounds(intent,style.font.id,style.sizeHalfPoints).maxWidth;
      if(words.length>1&&words.every(g=>g.isWordLike)&&boundaries.every(at=>graphemes.has(at)&&clusters.has(Buffer.byteLength(block.text.slice(0,at))))&&
          words.every(g=>g.segment.length*envelope<=available)){
       // Empirical native measurement profile, not a language/shaping rule:
       // fewer origins reduce measured rounding here. Keep windows bounded to
       // four complete source words AND the same font envelope as admission.
       const ends:number[]=[];let count=0,length=0;
       for(const word of words){
        if(count===4||(length+word.segment.length)*envelope>available){ends.push(word.index);count=0;length=0;}
        count++;length+=word.segment.length;
       }
       ends.push(block.text.length);
       wordsByBlock.set(key(block.scope,block.nodeId),Object.freeze({ends:Object.freeze(ends),words:words.length}));
      }
     }
     retain('variable-source-line-baseline');continue;
    }
    const sourceBaseline=(sourceMin+sourceMax)/2;
    // Word's measured Exact-frame baseline is .8H in this calibration domain.
    const nativeBaseline=.8*height,position=Math.round(2*(nativeBaseline-sourceBaseline));
    const corrected=nativeBaseline-position/2,upper=corrected-ascent,lower=height-corrected-descent;
    // Keep positive headroom beyond native half-point and output rounding.
    if(upper<.3||lower<.3){retain('insufficient-quantized-ink-headroom');continue;}
    Object.assign(decision,{policy:'font-metric-exact',reason:'bounded-source-ink-and-calibrated-frame',
     sourceBaselinePt:sourceBaseline,nativeBaselinePt:nativeBaseline,positionHalfPoints:position,
     upperHeadroomPt:upper,lowerHeadroomPt:lower});
    decisions.set(key(block.scope,block.nodeId),Object.freeze(decision));
    // A Latin prefix can change where a later Thai mark cluster wraps even
    // though the mark run itself has no tracking. For ambiguous native
    // clusters, conserve each complete ASCII word advance instead; baseline
    // admission remains independent.
    // A whitespace token that could itself overflow needs the neutral fallback.
    // Only ordinary section roots qualify: cells/bands have different widths.
    // This is a conservative admission envelope, not a Word wrap predictor.
    let tokenBounded=false;
    const section=(intent.document.sections as any[]).find(s=>s.rootIds.includes(block.nodeId));
    if(!Number.isFinite(maxWidth)&&section){
     const page=section.page,pw=(page.orientation==='portrait'?210:297)*72/25.4;
     const available=Math.min(pw-toPoints(page.margin.left)-toPoints(page.margin.right),
      (Math.round(pw*20)-toTwips(page.margin.left)-toTwips(page.margin.right))/20)-1.5;
     const envelope=concreteFontBounds(intent,style.font.id,style.sizeHalfPoints).maxWidth;
     const bound=Math.max(...block.text.split(/\s+/u).map(token=>token.length*envelope));
     tokenBounded=Number.isFinite(bound)&&bound<=available;
     if(tokenBounded){
      // Preserve the frozen baseline decision; attach admission diagnostics only.
      decisions.set(key(block.scope,block.nodeId),Object.freeze({...decision,maxTokenEnvelopePt:bound,tokenAvailableWidthPt:available}));
     }
    }
    const selected=Number.isFinite(maxWidth)||tokenBounded?pairs:neutral;
    if(selected.size)pairsByBlock.set(key(block.scope,block.nodeId),selected);
   }catch{wordsByBlock.delete(key(block.scope,block.nodeId));cancelled();retain('metric-proof-unavailable');}
  }
  const safeTables=new Set<string>(),nodes:any=intent.document.nodes;
  for(const table of intent.tables){
   if(table.scope!=='nodes')continue;
   const n=nodes[table.nodeId];let safe=true;
   for(const rid of n.rowIds)for(const [index,cid] of nodes[rid].cellIds.entries()){
    const c=nodes[cid],col=c.props.columnIndex??index,span=c.props.colSpan??1;
    const pad=table.cells.find(v=>v.nodeId===cid)!.paddingTwips;
    // Retain the pre-existing native wrap width: account for the half-point
    // border and reserve another point for measured native advance rounding.
    const available=(table.columnTwips.slice(col,col+span).reduce((a,b)=>a+b,0)-pad.left-pad.right)/20-1.5;
    for(const id of c.childIds){const d=decisions.get(key('nodes',id));
     if(d?.policy!=='font-metric-exact'||d.maxUnwrappedWidthPt===undefined||!Number.isFinite(d.maxUnwrappedWidthPt)||d.maxUnwrappedWidthPt>available){safe=false;pairsByBlock.delete(key('nodes',id));}
    }
   }
   if(safe)safeTables.add(table.nodeId);
   // A table-wide width proof is separate from one bounded cell's character
   // advances. Unproved neighbours must not discard that cell's source proof;
   // the native table grid, spans and row relationships remain unchanged.
  }
  cancelled();proofs.set(intent,decisions);thaiWords.set(intent,wordsByBlock);pairProofs.set(intent,pairsByBlock);tableWidths.set(intent,safeTables);
 }finally{
  signal?.removeEventListener('abort',abort);
  await Promise.allSettled([...sessions.values()].map(s=>s.close()));
  if(directory&&dirname(directory)===tmpdir())await rm(directory,{recursive:true,force:true});
 }
}
