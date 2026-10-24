import {measureText} from '../layout/measureText.js';
import type {TextRuntime} from '../layout/textFlow.js';
import {requireGenuineIntent} from './profile.js';
import {sourceGraph,fieldDigitBudget} from './fields.js';
import {fail,type ExportIntent} from './types.js';
import {toPoints} from './units.js';
interface Extent {height:number;firstLineHeight:number;lines:number;}
const records=new WeakMap<ExportIntent,ReadonlyMap<string,Extent>>();
const key=(scope:string,id:string,width:number,start=0)=>JSON.stringify([scope,id,width,start]);
export function measuredReadingExtent(intent:ExportIntent,scope:string,id:string,width:number,start=0){requireGenuineIntent(intent);return records.get(intent)?.get(key(scope,id,width,start));}
export function hasReadingMeasurements(intent:ExportIntent){requireGenuineIntent(intent);return records.has(intent);}
export function readingMeasurementReceipt(intent:ExportIntent){requireGenuineIntent(intent);const r=records.get(intent);return r?[{kind:'source-reading-measurement',measuredExtents:r.size,basis:'shared-source-shaper-and-line-measurement',nativeWidthSafetyPt:1.5,wordVerified:false}]:[];}
/** Private intent-owned measurements. No PDF, caller fit hint or fixture identity. */
export async function prepareReadingMeasurements(intent:ExportIntent,runtime:TextRuntime,signal?:AbortSignal){
 requireGenuineIntent(intent);const nodes:any=intent.document.nodes,requests=new Map<string,{scope:string;id:string;width:number;start:number}>();
 const add=(scope:string,id:string,width:number,start=0)=>{if(sourceGraph(intent,scope)[id]?.type==='text-block')requests.set(key(scope,id,width,start),{scope,id,width,start});};
 const slot=(ids:string[],width:number)=>{for(let i=0;i+1<ids.length;i++)if(nodes[ids[i]!]!.type==='text-block'&&nodes[ids[i+1]!]!.type==='image'){
  const id=ids[i]!,b=intent.textBlocks.find(b=>b.scope==='nodes'&&b.nodeId===id)!;add('nodes',id,width);const at=b.text.lastIndexOf('\n');if(at>=0&&at+1<b.text.length)add('nodes',id,width,at+1);
 }};
 const row=(table:any,id:string)=>{for(const [index,cid]of nodes[id].cellIds.entries()){
  const c=nodes[cid],column=c.props.columnIndex??index,span=c.props.colSpan??1,mapped=intent.tables.find(t=>t.nodeId===table.id)!,padding=mapped.cells.find(c=>c.nodeId===cid)!.paddingTwips;
  const width=(mapped.columnTwips.slice(column,column+span).reduce((a,b)=>a+b,0)-padding.left-padding.right)/20;
  for(const child of c.childIds)add('nodes',child,width);slot(c.childIds,width);
 }};
 const band=(scope:string,b:any,width:number)=>{
  const walk=(ids:string[],available:number)=>{for(const id of ids){const n=b.nodes[id];if(n.type==='text-block')add(scope,id,available);else if(n.type==='columns'){
   const gap=n.props.gap?toPoints(n.props.gap):0,total=n.columns.reduce((sum:number,c:any)=>sum+c.weight,0),usable=available-gap*(n.columns.length-1);
   for(const c of n.columns)walk(c.childIds,usable*c.weight/total);
  }}};walk(b.rootIds,width);
 };
 for(const [index,s]of intent.document.sections!.entries()){
  const p=s.page,width=(p.orientation==='portrait'?210:297)*72/25.4-toPoints(p.margin.left)-toPoints(p.margin.right);slot(s.rootIds,width);
  if(s.endingArea)for(const id of s.endingArea.rootIds){const n=nodes[id];if(n.type==='text-block')add('nodes',id,width);else if(n.type==='table')for(const rid of n.rowIds)row(n,rid);}
  if(s.role==='cover')for(const id of s.rootIds){const n=nodes[id];if(n.type==='text-block')add('nodes',id,width);else if(n.type==='table')for(const rid of n.rowIds)row(n,rid);}
  for(let i=0;i<s.rootIds.length;i++){
   const id=s.rootIds[i]!,n=nodes[id];if(n.type!=='text-block'||!n.props.toc)continue;
   const a=nodes[s.rootIds[i+1]!],b=nodes[s.rootIds[i+2]!],t=a?.type==='table'?a:a?.type==='text-block'&&!a.props.toc&&b?.type==='table'?b:undefined;
   if(t){add('nodes',id,width);if(a!==t)add('nodes',a.id,width);row(t,t.rowIds[0]);}
  }
  for(const kind of ['header','footer']as const){const b=s[kind]??(intent.document as any)[kind];if(b){const bw=b.placement?(p.orientation==='portrait'?210:297)*72/25.4-toPoints(b.placement.left)-toPoints(b.placement.right):width;band(s[kind]?`sections.${index}.${kind}.nodes`:`${kind}.nodes`,b,bw);}}
 }
 for(const t of intent.tables){const n=nodes[t.nodeId];for(const rid of n.rowIds){for(const cid of nodes[rid].cellIds){const c=nodes[cid],index=nodes[rid].cellIds.indexOf(cid),col=c.props.columnIndex??index,span=c.props.colSpan??1,pad=t.cells.find(v=>v.nodeId===cid)!.paddingTwips;slot(c.childIds,(t.columnTwips.slice(col,col+span).reduce((a,b)=>a+b,0)-pad.left-pad.right)/20);}}
  for(const g of n.rowGroups??[])if(g.keepStart&&g.prefixRowIds.length)for(const rid of [...n.rowIds.slice(0,n.props.repeatHeaderRows?n.props.headerRowCount:0),...g.prefixRowIds,g.firstMemberRowId])row(n,rid);
 }
 const result=new Map<string,Extent>();let units=0,calls=0;
 const check=()=>{if(signal?.aborted)fail('DOCX_CANCELLED','options.signal','Cancelled during reading measurement');};
 const measuredRuntime={...runtime,shape:async(...args:Parameters<TextRuntime['shape']>)=>{check();units+=args[0].length;if(++calls>32768||units>4194304)fail('DOCX_OUTPUT_BUDGET_EXCEEDED','reading-measurement','Relationship measurement budget exceeded');return runtime.shape(...args);}};
 for(const [k,r]of requests){
  check();const node:any=sourceGraph(intent,r.scope)[r.id],block=intent.textBlocks.find(b=>b.scope===r.scope&&b.nodeId===r.id)!;
  if(node.props.heightMode==='fixed'){const height=toPoints(node.props.height);result.set(k,{height,firstLineHeight:height,lines:1});continue;}
  // Native dynamic fields use a conservative decimal envelope, never a fixed
  // current-page value. Every decimal glyph is shaped before selecting widest.
  let copy=node;
  if(r.start)copy={...node,children:[{id:node.id+'-measured-tail',type:'text',text:block.text.slice(r.start)}]};
  if(block.spans.some(s=>s.type==='system-page-field')){
   const effective=intent.styles[block.styleId]!;let digit='0',advance=-1;
   for(const c of '0123456789'){const s=await measuredRuntime.shape(c,effective.font.id,effective.sizeHalfPoints/2),w=s.glyphs.reduce((n,g)=>n+g.advancePt,0);if(w>advance){digit=c;advance=w;}}
   copy={...copy,children:copy.children.map((c:any)=>c.type==='system-page-field'?{id:c.id,type:'text',text:digit.repeat(fieldDigitBudget(intent))}:c)};
  }
  const style=intent.document.styles[node.props.textStyleId]!;
  const lines=await measureText(copy,style,Math.max(.05,r.width-1.5),measuredRuntime);check();
  result.set(k,{height:lines.reduce((n,l)=>n+l.heightPt,0),firstLineHeight:lines[0]?.heightPt??0,lines:lines.length});
 }
 check();records.set(intent,result);
}
