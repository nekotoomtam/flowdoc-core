import {sourceWordBoundaries} from './source-word-boundaries.js';
import {legacyTableStrokeGeometry} from '../composition/strokeStyle.js';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {createTextRuntime} from '../runtime/textRuntime.js';
import {measureText} from '../layout/measureText.js';
import type {ExportResources} from '../runtime/exportResources.js';
import type {Glyph} from '../pdf/drawContract.js';
import {intentResourceBytes,requireGenuineIntent} from './profile.js';
import {SourceFontMetrics} from './source-layout-font.js';
import {fail,type ExportIntent,type EffectiveStyle} from './types.js';
import {toPoints} from './units.js';
import {hash} from './resources.js';
import {deriveReadingPlan} from './groups.js';
import {prepareReadingMeasurements} from './reading-measurements.js';

export interface SourceWord {text:string;start:number;end:number;xPt:number;advancePt:number;glyphs:Glyph[];}
export interface SourceLine {text:string;sourceStart:number;sourceEnd:number;heightPt:number;baselinePt:number;frameTwips:number;words:SourceWord[];}
export interface SourceGuide {nodeId:string;scope:string;tag:string;text:string;textDigest:string;style:EffectiveStyle;font:SourceFontMetrics;lines:SourceLine[];cellInsetPt:number;}
interface Capsule {guides:Map<string,SourceGuide>;applied:Map<string,SourceGuide>;fallbacks:{nodeId:string;reason:string}[];}
const capsules=new WeakMap<ExportIntent,Capsule>();
export function sourceGuide(intent:ExportIntent,nodeId:string){requireGenuineIntent(intent);return capsules.get(intent)?.guides.get(nodeId);}
export function applySourceGuide(intent:ExportIntent,guide:SourceGuide){
 requireGenuineIntent(intent);const c=capsules.get(intent);if(!c||c.guides.get(guide.nodeId)!==guide||c.applied.has(guide.tag))fail('DOCX_INPUT_INVALID','intent','Invalid or duplicated source paragraph mapping');c.applied.set(guide.tag,guide);return c.applied.size;
}
export function appliedSourceGuides(intent:ExportIntent){requireGenuineIntent(intent);return [...(capsules.get(intent)?.applied.values()??[])];}
export function sourceLayoutReceipts(intent:ExportIntent){
 requireGenuineIntent(intent);const c=capsules.get(intent);if(!c)return [];
 const fallbacks=[...c.fallbacks,...[...c.guides.values()].filter(g=>!c.applied.has(g.tag)).map(g=>({nodeId:g.nodeId,reason:'native-flow-protected-by-reading-plan'}))];
 return [{kind:'source-word-layout',policy:c.applied.size?'source-measured-editable-word-boxes':'retain-native',sourceOnly:true,wordVerified:false,
  sourceParagraphs:c.applied.size,sourceLines:[...c.applied.values()].reduce((n,g)=>n+g.lines.length,0),
  editBehavior:'regenerate-after-edit',generatedControls:'native-line-paragraphs-and-editable-word-boxes',
  ...(c.applied.size?{paragraphMap:'customXml/flowdoc-paragraphs.xml'}:{}),fallbacks}];
}
/** Pure source measurement; no PDF engine, pagination result or captured draw input. */
export async function prepareSourceLayout(intent:ExportIntent,resources:Pick<ExportResources,'fonts'|'shaperPath'|'segmenterPath'>,signal?:AbortSignal,nativeOnly=false){
 requireGenuineIntent(intent);if(!isAbsolute(resources.shaperPath)||!isAbsolute(resources.segmenterPath))fail('DOCX_RESOURCE_INVALID','resources','Shared source executables require absolute paths');
 const c:Capsule={guides:new Map(),applied:new Map(),fallbacks:[]},d=intent.document,nodes=d.nodes;
 const cancel=()=>{if(signal?.aborted)fail('DOCX_CANCELLED','options.signal','Export cancelled during source measurement');};
 let directory:string|undefined,runtime:ReturnType<typeof createTextRuntime>|undefined,remaining=65536,shapedUnits=0,shapeRequests=0;
 try{
  cancel();directory=await mkdtemp(join(tmpdir(),'flowdoc-docx-source-'));
  const owned=[];
  for(const [i,f]of resources.fonts.entries()){
   cancel();const path=join(directory,'font-'+i+'.ttf');await writeFile(path,intentResourceBytes(intent,'font',f.id),{flag:'wx',mode:0o600});owned.push({...f,path});
  }
  runtime=createTextRuntime({...resources,fonts:owned},signal);
  await prepareReadingMeasurements(intent,runtime,signal);
  const reading=deriveReadingPlan(intent);if(!reading.ok){const issue=reading.issues[0]!;fail(issue.code,issue.path??'nodes',issue.message);}
  if(nativeOnly){c.fallbacks.push(...intent.textBlocks.filter(b=>b.scope==='nodes').map(b=>({nodeId:b.nodeId,reason:'explicit-native-paragraph-flow'})));cancel();capsules.set(intent,c);return;}
  const fontMetrics=new Map<string,SourceFontMetrics>();
  for(const block of intent.textBlocks){
   cancel();const node=nodes[block.nodeId],retain=(reason:string)=>c.fallbacks.push({nodeId:block.nodeId,reason});
   if(d.sections?.some(s=>s.endingArea&&s.endingArea.areaId===d.sourceMap[block.nodeId]?.areaId&&s.sectionId===d.sourceMap[block.nodeId]?.sectionId)){retain('native-ending-area');continue;}
   if(block.scope!=='nodes'||node?.type!=='text-block'||node.props.heightMode==='fixed'||node.props.toc||node.props.anchorId||node.props.textAlign&&node.props.textAlign!=='left'||block.spans.some(s=>s.type!=='text')){retain('protected-or-nonplain-native-content');continue;}
   if(!block.text.trim()||!/^[\u0020-\u007e\u0e00-\u0e7f\p{Script=Latin}\u0300-\u036f]+$/u.test(block.text)){retain('outside-source-word-script-or-authored-line-profile');continue;}
   if(block.text.length>4096||block.text.length>remaining){retain('source-measurement-budget');continue;}
   const fragments=reading.value.fragments.filter(f=>f.nodeId===block.nodeId);
   if(fragments.length!==1||fragments[0]!.start!==0||fragments[0]!.end!==block.text.length||fragments[0]!.keepNext||fragments[0]!.keepLines||reading.value.edges.some(e=>e.from===node.id||e.to===node.id)){retain('native-flow-protected-by-reading-plan');continue;}
   let owner=node.id,cellInsetPt=0,width:number|undefined;
   const cell=Object.values(nodes).find(n=>n.type==='table-cell'&&n.childIds.includes(node.id));
   if(cell?.type==='table-cell'){
    const row=Object.values(nodes).find(n=>n.type==='table-row'&&n.cellIds.includes(cell.id));
    const table=row&&Object.values(nodes).find(n=>n.type==='table'&&n.rowIds.includes(row.id));
    if(!row||row.type!=='table-row'||!table||table.type!=='table'||(cell.props.colSpan??1)!==1||(cell.props.rowSpan??1)!==1){retain('native-merged-or-unresolved-cell');continue;}
    if(table.rowIds.indexOf(row.id)<table.props.headerRowCount||!row.props.allowBreak||reading.value.keptRows[table.id]?.includes(row.id)||(table.rowGroups??[]).some(g=>g.keepStart&&g.prefixRowIds.length>0&&g.rowIds.includes(row.id))||reading.value.edges.some(e=>e.from===table.id||e.to===table.id)){retain('native-flow-protected-by-reading-plan');continue;}
    if(!legacyTableStrokeGeometry(table)){retain('native-custom-table-borders');continue;}
    owner=table.id;const column=cell.props.columnIndex??row.cellIds.indexOf(cell.id);
    width=toPoints(table.columns[column]!.width)-toPoints(cell.props.padding?.left??{unit:'pt',value:4})-toPoints(cell.props.padding?.right??{unit:'pt',value:4});
    // Native tables use a half-point border. Source cell origins use its centre;
    // Word's text-canvas anchors use the outer grid edge. Row budgets stay intact.
    cellInsetPt=.5/2;
   }
   const section=d.sections?.find(s=>s.rootIds.includes(owner));
   if(d.sections?.length&&!section){retain('native-nested-or-unresolved-section-width');continue;}
   const page=section?.page??d.book.page;
   width??=(page.orientation==='landscape'?297:210)*72/25.4-toPoints(page.margin.left)-toPoints(page.margin.right);
   const style=d.styles[node.props.textStyleId]!,effective=intent.styles[block.styleId]!;
   let font=fontMetrics.get(effective.font.id);if(!font){font=new SourceFontMetrics(intentResourceBytes(intent,'font',effective.font.id));fontMetrics.set(effective.font.id,font);}
   remaining-=block.text.length;let blockUnits=0,blockRequests=0;
   const shape:typeof runtime.shape=async(text,fontId,sizePt)=>{
    blockUnits+=text.length;shapedUnits+=text.length;blockRequests++;shapeRequests++;
    // Charge before the shared cache/native request. Long unbroken tokens must
    // not retain quadratic glyph data until the later package-size check.
    if(blockUnits>262144||shapedUnits>1048576||blockRequests>2048||shapeRequests>8192)fail('DOCX_OUTPUT_BUDGET_EXCEEDED','source-layout.measurement','Source shaping budget exceeded');
    return runtime!.shape(text,fontId,sizePt);
   };
   const measured=await measureText(node,style,width,{...runtime,shape});cancel();
   if(measured.some(l=>!l.run)||measured.map(l=>l.run!.text).join('')!==block.text)fail('DOCX_GEOMETRY_UNREPRESENTABLE','nodes.'+node.id,'Source line coverage differs from authored text');
   let sourceStart=0,height=0;const lines:SourceLine[]=[];
   for(const line of measured){
    const run=line.run!,boundaries=[...new Set([...(await runtime.breaks(run.text)),run.text.length])].sort((a,b)=>a-b);
    const ends=sourceWordBoundaries(run.text,run.glyphs,boundaries);
    let start=0,x=run.bounds.xPt;const words:SourceWord[]=[];
    for(const end of ends){
     const glyphs=run.glyphs.filter(g=>g.clusterStartOffset>=start&&g.clusterEndOffset<=end),text=run.text.slice(start,end);if(!glyphs.length)fail('DOCX_GEOMETRY_UNREPRESENTABLE','nodes.'+node.id,'Empty source glyph word');
     const advancePt=glyphs.reduce((n,g)=>n+g.advancePt,0),prior=words.at(-1);
     if(!text.trim()&&prior){prior.text+=text;prior.end=end;prior.advancePt+=advancePt;prior.glyphs.push(...glyphs);}
     else words.push({text,start,end,xPt:x,advancePt,glyphs:[...glyphs]});
     x+=advancePt;start=end;
    }
    if(start!==run.text.length||words.map(w=>w.text).join('')!==run.text)fail('DOCX_GEOMETRY_UNREPRESENTABLE','nodes.'+node.id,'Incomplete source word boundaries');
    const begin=Math.round(height*20);height+=line.heightPt;const frameTwips=Math.round(height*20)-begin;
    if(frameTwips<1)fail('DOCX_GEOMETRY_UNREPRESENTABLE','nodes.'+node.id,'Source line frame quantizes to zero');
    lines.push({text:run.text,sourceStart,sourceEnd:sourceStart+run.text.length,heightPt:line.heightPt,baselinePt:run.baselineOffsetPt,frameTwips,words});sourceStart+=run.text.length;
   }
   const tag='flowdoc-p-'+hash(JSON.stringify([intent.sourceDigest,block.scope,block.nodeId])).slice(0,24);
   c.guides.set(node.id,{nodeId:node.id,scope:block.scope,tag,text:block.text,textDigest:hash(block.text),style:effective,font,lines,cellInsetPt});
  }
  cancel();capsules.set(intent,c);
 }catch(error){cancel();throw error;}
 finally{
  let error:unknown;try{await runtime?.close();}catch(e){error=e;}
  try{if(directory)await rm(directory,{recursive:true,force:true});}catch(e){error??=e;}
  if(error)fail('DOCX_CLEANUP_FAILED','resources','Source text resource cleanup failed');
 }
}
