import {Run} from 'docx';
import {compoundDrawing} from './compound-drawing.js';
import {resolveTableStroke,TABLE_BORDER_SIDES,hasCompoundTableStroke,type ResolvedStroke} from '../composition/strokeStyle.js';
import {concreteFontBounds} from './font-envelope.js';
import {measuredReadingExtent} from './reading-measurements.js';
import {SourceFontMetrics} from './source-layout-font.js';
import {intentResourceBytes} from './profile.js';
import {fail,type ExportIntent} from './types.js';
import type {TableSpaceReceipt} from './tables.js';

const kind='thickThinWideGap';
const ids=new WeakMap<ExportIntent,number>();
type Edge={x0:number;y0:number;x1:number;y1:number;stroke:ResolvedStroke};
export interface CompoundRows {heights:number[];draw:(row:number)=>Run[];}
/** B supports literal, unwrapped ASCII cells. It never sets row height/page cuts.
 * Extents follow the authored lines, owned font metrics and emitted cell inset.
 * Word edits/fallback fonts require regeneration; continuation closing rules
 * are deliberately not synthesized from an assumed row-per-page count.
 */
export function compoundTableRows(intent:ExportIntent,table:any,mapped:ExportIntent['tables'][number],space:TableSpaceReceipt,bodyHeightPt?:number):CompoundRows|undefined{
 if(!hasCompoundTableStroke(table))return;
 const nodes:any=intent.document.nodes,path='nodes.'+table.id;
 const unsupported=(message:string):never=>fail('DOCX_CAPABILITY_UNSUPPORTED',path,message);
 if(TABLE_BORDER_SIDES.some(s=>!['none',kind].includes(resolveTableStroke(table,s).style)))unsupported('B DOCX tables require all visible edges to use thickThinWideGap');
 const heights:number[]=[],fonts=new Map<string,SourceFontMetrics>();
 for(const [index,rid]of table.rowIds.entries()){
  const row=nodes[rid];let height=0;
  const insets=row.cellIds.map((id:string)=>space.cells.find(c=>c.nodeId===id)!);
  if(new Set(insets.map((p:TableSpaceReceipt['cells'][number])=>p.nativeTopTwips)).size!==1||new Set(insets.map((p:TableSpaceReceipt['cells'][number])=>p.nativeBottomTwips)).size!==1)unsupported('B DOCX rows require uniform emitted vertical cell margins');
  for(const [ci,cid]of row.cellIds.entries()){
   const cell=nodes[cid],col=cell.props.columnIndex??ci,pad=space.cells.find(c=>c.nodeId===cid)!;
   if((cell.props.colSpan??1)!==1||(cell.props.rowSpan??1)!==1||cell.childIds.length!==1||cell.props.fillColor||index<table.props.headerRowCount&&table.props.headerFillColor)unsupported('B DOCX tables require unmerged, unshaded, single text-block cells');
   const id=cell.childIds[0],node=nodes[id],block=intent.textBlocks.find(b=>b.scope==='nodes'&&b.nodeId===id);
   if(node?.type!=='text-block'||node.props.heightMode==='fixed'||!block||block.spans.some(s=>s.type!=='text'&&!(index<table.props.headerRowCount&&s.type==='line-break'))||!/^[\x20-\x7e\n]*$/.test(block.text))unsupported('B DOCX cells require literal ASCII text and optional authored header breaks');
   const lines=block!.text.split('\n');
   if(index>=table.props.headerRowCount&&lines.length!==1)unsupported('B DOCX multiline body rows may split; use a native border style');
   if(lines.length>8||lines.some(t=>!t.trim())&&block!.text.length>0)unsupported('B DOCX header line extent is unsupported');
   const style=intent.styles[block!.styleId]!,width=(mapped.columnTwips[col]!-pad.nativeLeftTwips-pad.nativeRightTwips)/20;
   const bounds=concreteFontBounds(intent,style.font.id,style.sizeHalfPoints),longest=Math.max(...lines.map(t=>t.length));
   if(longest*bounds.maxWidth>width){
    const measured=measuredReadingExtent(intent,'nodes',id,(mapped.columnTwips[col]!-mapped.cells.find(c=>c.nodeId===cid)!.paddingTwips.left-mapped.cells.find(c=>c.nodeId===cid)!.paddingTwips.right)/20);
    if(!measured||measured.lines!==lines.length)unsupported('B DOCX cell may wrap; native measurements are required and must fit the authored lines');
   }
   let font=fonts.get(style.font.id);if(!font){font=new SourceFontMetrics(intentResourceBytes(intent,'font',style.font.id));fonts.set(style.font.id,font);}
   const natural=font.nativeLineUnits/font.units*style.sizeHalfPoints/2;
   const line=Math.max(style.line.twips,Math.round(natural*20))/20;
   height=Math.max(height,line*lines.length+(pad.nativeTopTwips+pad.nativeBottomTwips+pad.paragraphBeforeTwips+pad.paragraphAfterTwips)/20);
  }
  heights.push(height);
 }
 const headerHeight=heights.slice(0,table.props.headerRowCount).reduce((a,b)=>a+b,0),envelope=Math.max(...TABLE_BORDER_SIDES.map(s=>resolveTableStroke(table,s)).filter(s=>s.style===kind).map(s=>s.widthPt));
 if(bodyHeightPt===undefined||!Number.isFinite(bodyHeightPt)||headerHeight+Math.max(0,...heights.slice(table.props.headerRowCount))+envelope+1>bodyHeightPt)unsupported('B DOCX header and body row must fit the reserved section body capacity');
 const xs=[0];for(const w of mapped.columnTwips)xs.push(xs.at(-1)!+w/20);
 return {heights,draw(row){
  const h=heights[row]!,edges:Edge[]=[],width=xs.at(-1)!;
  const edge=(side:Parameters<typeof resolveTableStroke>[1],x0:number,y0:number,x1:number,y1:number)=>{const stroke=resolveTableStroke(table,side);if(stroke.style===kind)edges.push({x0,y0,x1,y1,stroke});};
  for(let c=0;c<xs.length;c++)edge(c===0?'left':c===xs.length-1?'right':'insideVertical',xs[c]!,0,xs[c]!,h);
  if(row===0)edge('top',0,0,width,0);
  edge(row===table.rowIds.length-1?'bottom':row===table.props.headerRowCount-1?'headerBottom':'insideHorizontal',0,h,width,h);
  const groups=new Map<string,Edge[]>();for(const e of edges){const key=JSON.stringify(e.stroke);groups.set(key,[...(groups.get(key)??[]),e]);}
  const cid=nodes[table.rowIds[row]].cellIds.find((id:string,index:number)=>(nodes[id].props.columnIndex??index)===0),pad=space.cells.find(c=>c.nodeId===cid)!;
  return [...groups.values()].map(group=>{
   const stroke=group[0]!.stroke,id=(ids.get(intent)??100000)+1;ids.set(intent,id);
   const drawing=compoundDrawing(id,width,h,pad.nativeLeftTwips,pad.nativeTopTwips+pad.paragraphBeforeTwips,stroke,group);
   return new Run({children:[drawing]});
  });
 }};
}
