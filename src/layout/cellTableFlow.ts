import {resolveTableGrid} from '../composition/tableGrid.js';
import type {GridCell} from '../composition/tableGrid.js';
import {toPt} from '../composition/resolvedDocument.js';
import type {ResolvedDocument,Table} from '../composition/resolvedDocument.js';
import {measureCellContent,resolveCellPadding} from './measureCellContent.js';
import type {MeasuredCellItem,PaddingPt} from './measureCellContent.js';

import type {Issue} from '../result.js';
import {LayoutError} from './textFlow.js';
import {FormatStop,formatCursor} from './formatLayout.js';
import type {TextRuntime} from './textFlow.js';
export interface CellTablePageSink {bounded?:boolean;omitImage?(nodeId:string):boolean;warn?(issue:Issue):void;top:number;bottom:number;nextCapacity?:number;left:number;availableWidth:number;y:number;fill?(x:number,y:number,width:number,height:number,color:string,nodeId:string):void;nextPage():void;emitItem(item:MeasuredCellItem,x:number,y:number,width:number):void;border(x1:number,y1:number,x2:number,y2:number,nodeId:string):void}
interface Cell extends GridCell {fillColor?:string|undefined;padding:PaddingPt;contentWidth:number;lines:{line:MeasuredCellItem;offset:number;drawn:boolean}[];label?:{first:MeasuredCellItem[];continuation:()=>Promise<MeasuredCellItem[]>;active:MeasuredCellItem[];shown:boolean;windowFrom:number}}
const eps=1e-6;
export async function cellTableFlow(d:ResolvedDocument,t:Table,runtime:TextRuntime,s:CellTablePageSink):Promise<void>{
 const grid=resolveTableGrid(t,d.nodes),widths=t.columns.map(c=>toPt(c.width));
 if(widths.some(w=>w<=0)||widths.reduce((a,b)=>a+b,0)>s.availableWidth+eps)throw new LayoutError(t.id,'Table columns exceed available content width');
 const xs=[0];for(const w of widths)xs.push(xs.at(-1)!+w);
 const labelIds=new Set((t.rowGroups??[]).flatMap(g=>g.groupLabel?[g.groupLabel.cellId]:[]));
 const cells:Cell[]=[];
 for(const c of grid.cells){const n=d.nodes[c.id];if(n?.type!=='table-cell')throw new LayoutError(c.id,'Expected cell');
  const padding=resolveCellPadding(n.props.padding),contentWidth=xs[c.column+c.colSpan]!-xs[c.column]!-padding.left-padding.right;
  if(Object.values(padding).some(v=>!Number.isFinite(v)||v<0))throw new LayoutError(c.id,'Invalid converted cell padding');
  if(!Number.isFinite(contentWidth)||contentWidth<=0)throw new LayoutError(c.id,'Cell padding leaves no content width');
  let offset=padding.top;const lines:Cell['lines']=[];
  for(const line of await measureCellContent(d,n.childIds,contentWidth,runtime)){lines.push({line,offset,drawn:false});offset+=line.heightPt;}
  const cell:Cell={...c,padding,contentWidth,lines,fillColor:n.props.fillColor??(c.row<t.props.headerRowCount?t.props.headerFillColor:undefined)};
  if(labelIds.has(c.id)){
   const text=d.nodes[n.childIds[0]!];if(text?.type!=='text-block')throw new LayoutError(c.id,'Expected group label text');
   const continued={...text,children:[...text.children,{id:text.id+'~group-label-continuation',type:'text' as const,text:' (ต่อ)'}]};
   let measured:MeasuredCellItem[]|undefined;
   const continuation=async()=>measured??(measured=await measureCellContent({...d,nodes:{...d.nodes,[text.id]:continued}},n.childIds,contentWidth,runtime)),first=lines.map(l=>l.line);
   cell.label={first,continuation,active:first,shown:false,windowFrom:0};cell.lines=[];
  }
  cells.push(cell);
 }
 const headerCount=t.props.headerRowCount,headerCells=cells.filter(c=>c.row<headerCount);
 const body=cells.filter(c=>c.row>=headerCount).map(c=>({...c,row:c.row-headerCount}));
 const labelsById=new Map(body.filter(c=>c.label).map(c=>[c.id,c]));
 const rowIds=t.rowIds.slice(headerCount);
 const rowPositions=new Map(rowIds.map((id,i)=>[id,i]));
 const starts=(t.rowGroups??[]).flatMap((group,index)=>group.keepStart?[{group,index,start:rowPositions.get(group.prefixRowIds[0]??group.firstMemberRowId)!,member:rowPositions.get(group.firstMemberRowId)!,relaxed:false}]:[]);
 const labelHeight=(c:Cell)=>c.padding.top+c.label!.active.reduce((sum,line)=>sum+line.heightPt,0)+c.padding.bottom;
 const cellsByRow=new Map<number,Cell[]>();for(const c of body){const list=cellsByRow.get(c.row)??[];list.push(c);cellsByRow.set(c.row,list);}
 const omitOversizedImages=(list:Cell[],capacity:number)=>{for(const c of list){let offset=c.padding.top;const retained:Cell['lines']=[];
  for(const item of c.lines){if(item.line.kind==='image-frame'&&item.line.heightPt+c.padding.top+c.padding.bottom>capacity+eps&&s.omitImage?.(item.line.nodeId))continue;retained.push({...item,offset});offset+=item.line.heightPt;}c.lines=retained;
 }};
 omitOversizedImages(headerCells,Math.max(s.bottom-s.top,s.nextCapacity??0));
 const headerHeight=headerCount?Math.max(0,...headerCells.map(c=>(c.lines.at(-1)?.offset??c.padding.top)+(c.lines.at(-1)?.line.heightPt??0)+c.padding.bottom)):0;
 if(headerHeight>Math.max(s.bottom-s.top,s.nextCapacity??0)+eps){if(s.bounded)throw new FormatStop('height-limit',[formatCursor(d,t.id,'node',{nodeType:'table'})]);throw new LayoutError(t.id,'Header exceeds page content height');}
 const rowSpace=rowIds.map(()=>0);
 const geometry=()=>{const heights=rowIds.map(()=>0),ordered=[...body].sort((a,b)=>a.row+a.rowSpan-b.row-b.rowSpan||a.row-b.row||a.column-b.column);
  for(const c of ordered.filter(c=>!c.label&&c.rowSpan===1))heights[c.row]=Math.max(heights[c.row]!, (c.lines.at(-1)?.offset??c.padding.top)+(c.lines.at(-1)?.line.heightPt??0)+c.padding.bottom);
  for(const c of ordered.filter(c=>!c.label&&c.rowSpan>1)){const need=(c.lines.at(-1)?.offset??c.padding.top)+(c.lines.at(-1)?.line.heightPt??0)+c.padding.bottom,have=heights.slice(c.row,c.row+c.rowSpan).reduce((a,b)=>a+b,0);if(need>have)heights[c.row+c.rowSpan-1]!+=need-have;}
  for(let i=0;i<heights.length;i++)heights[i]!+=rowSpace[i]!;
  for(const c of ordered.filter(c=>c.label)){const start=heights.slice(0,c.row).reduce((a,b)=>a+b,0),need=Math.max(0,c.label!.windowFrom-start)+labelHeight(c),have=heights.slice(c.row,c.row+c.rowSpan).reduce((a,b)=>a+b,0);if(need>have)heights[c.row+c.rowSpan-1]!+=need-have;}
  const ys=[0];for(const h of heights)ys.push(ys.at(-1)!+h);return {heights,ys};
 };
 const paintedCells=new Set<string>();
 const paint=(list:Cell[],ys:number[],from:number,to:number,at:number,sharedTop=false)=>{
  // Union collinear edges: shared or partially shared cell edges are stroked once.
  const edges=new Map<string,{axis:'h'|'v';fixed:number;segments:[number,number][]}>();
  const edge=(axis:'h'|'v',fixed:number,a:number,b:number)=>{if(b-a<eps)return;const key=axis+':'+fixed.toFixed(6),e=edges.get(key)??{axis,fixed,segments:[]};e.segments.push([a,b]);edges.set(key,e);};
  for(const c of list){const start=ys[c.row]!,end=ys[c.row+c.rowSpan]!,lo=Math.max(start,from),hi=Math.min(end,to);if(hi-lo<=eps)continue;
   paintedCells.add(c.id);const x=s.left+xs[c.column]!,right=s.left+xs[c.column+c.colSpan]!,top=at+lo-from,bottom=at+hi-from;
   if(c.fillColor)s.fill?.(x,top,right-x,bottom-top,c.fillColor,c.id);
   if(!sharedTop||lo>from+eps)edge('h',top,x,right);edge('h',bottom,x,right);edge('v',x,top,bottom);edge('v',right,top,bottom);
   if(c.label){let y=top+c.padding.top;for(const line of c.label.active){s.emitItem(line,x+c.padding.left,y,c.contentWidth);y+=line.heightPt;}c.label.shown=true;}
   for(const l of c.lines){const y=start+l.offset;if(!l.drawn&&y>=from-eps&&y+l.line.heightPt<=to+eps){s.emitItem(l.line,x+c.padding.left,at+y-from,c.contentWidth);l.drawn=true;}}
  }
  for(const e of edges.values()){e.segments.sort((a,b)=>a[0]-b[0]);let [a,b]=e.segments[0]!;const emit=()=>e.axis==='h'?s.border(a,e.fixed,b,e.fixed,t.id):s.border(e.fixed,a,e.fixed,b,t.id);
   for(const [lo,hi] of e.segments.slice(1)){if(lo<=b+eps)b=Math.max(b,hi);else{emit();a=lo;b=hi;}}emit();}
 };
 const drawHeader=()=>{for(const c of headerCells)for(const l of c.lines)l.drawn=false;paint(headerCells,[0,headerHeight],0,headerHeight,s.y);s.y+=headerHeight;};
 const fullBodyHeight=Math.max(s.bottom-s.top,s.nextCapacity??0)-(t.props.repeatHeaderRows?headerHeight:0);
 omitOversizedImages(body,fullBodyHeight);
 let from=0,first=true,pendingLabel:Cell|undefined;
 const stop=(reason:'height-limit'|'unbreakable-item-does-not-fit'='height-limit'):never=>{
  const unfinished=body.filter(c=>c.lines.some(l=>!l.drawn)),ys=geometry().ys;
  const row=Math.min(rowIds.length-1,Math.max(0,ys.findLastIndex(y=>y<=from+eps)));
  const cursors=unfinished.filter(c=>c.row<=row&&c.row+c.rowSpan>row).map(c=>{
   const item=c.lines.find(l=>!l.drawn)!.line,extra={tableId:t.id,rowId:rowIds[c.row]!,cellId:c.id};
   return formatCursor(d,item.nodeId,item.kind==='image-frame'?'image':'text',{...extra,...(item.kind==='text-line'?{lineIndex:c.lines.filter(l=>l.line.nodeId===item.nodeId&&l.drawn).length,...(item.line.run?.sourceStart===undefined?{}:{sourceOffset:item.line.run.sourceStart})}:{})});
  });
  if(pendingLabel){const c=pendingLabel;const n=d.nodes[c.id];if(n?.type==='table-cell')cursors.unshift(formatCursor(d,n.childIds[0]!,'text',{tableId:t.id,rowId:rowIds[c.row]!,cellId:c.id}));}
  const actual=cursors.some(c=>c.kind==='image')?'image-does-not-fit':reason;
  const completedNodeIds=[...headerCells,...body].flatMap(c=>{const cell=d.nodes[c.id];return cell?.type==='table-cell'&&paintedCells.has(c.id)?cell.childIds.filter(id=>c.lines.filter(l=>l.line.nodeId===id).every(l=>l.drawn)):[];});
  throw new FormatStop(actual,cursors.length?cursors:[formatCursor(d,t.id,'node',{nodeType:'table'})],completedNodeIds);
 };
 for(const c of body)if(!s.bounded&&c.padding.top+c.padding.bottom>fullBodyHeight+eps)throw new LayoutError(c.id,'Cell padding exceeds printable page');
 if(!rowIds.length||geometry().ys.at(-1)!<=eps){if(s.y+headerHeight>s.bottom+eps)s.nextPage();if(headerCount)drawHeader();return;}
 pages: while(true){let g=geometry();if(from>=g.ys.at(-1)!-eps)break;
  for(const c of body)if(c.label&&g.ys[c.row+c.rowSpan]!>from+eps){c.label.active=c.label.shown?await c.label.continuation():c.label.first;c.label.windowFrom=from;}
  g=geometry();pendingLabel=undefined;
  const hh=first||t.props.repeatHeaderRows?headerHeight:0,capacity=s.bottom-s.y-hh;
  const full=Math.max(s.bottom-s.top,s.nextCapacity??0)-(t.props.repeatHeaderRows?headerHeight:0);
  for(const c of body)if(!s.bounded&&c.label&&g.ys[c.row+c.rowSpan]!>from+eps&&labelHeight(c)>full+eps){const error=new LayoutError(c.id,'Group label cannot fit a usable page');error.reason='group-label-does-not-fit';throw error;}
  for(const [i,id] of rowIds.entries()){const r=d.nodes[id];if(!s.bounded&&r?.type==='table-row'&&!r.props.allowBreak&&g.ys[i+1]!>from+eps&&g.heights[i]!>full+eps)throw new LayoutError(id,'Protected row exceeds page');}
  for(const c of body)for(const l of c.lines)if(!s.bounded&&!l.drawn&&l.line.heightPt+c.padding.top+c.padding.bottom>full+eps)throw new LayoutError(l.line.nodeId,l.line.kind==='image-frame'?'Image frame cannot fit with table header and padding':'Next whole line cannot fit with header');
  let cut=Math.min(g.ys.at(-1)!,from+capacity);
  const pending=body.flatMap(c=>c.lines.filter(l=>!l.drawn).map(l=>({start:g.ys[c.row]!+l.offset,end:g.ys[c.row]!+l.offset+l.line.heightPt+c.padding.bottom})));
  // Carry the final line with trailing padding rather than create an empty
  // continuation page. Preserve padding instead of clipping the cell rectangle.
  if(cut<g.ys.at(-1)!-eps&&pending.length&&pending.every(l=>l.end<=cut+eps))cut=Math.min(cut,Math.max(...pending.map(l=>l.start)));

  // A tall label may need blank space below complete protected members. Extend the
  // last legal row, rather than cutting another protected row or dropping the group.
  for(const c of labelsById.values()){
   const lo=Math.max(from,g.ys[c.row]!),target=lo+labelHeight(c);
   if(g.ys[c.row+c.rowSpan]!<=from+eps||target>cut+eps)continue;
   let row=-1;
   for(let i=c.row;i<c.row+c.rowSpan;i++)if(g.ys[i+1]!>lo+eps&&g.ys[i+1]!<=cut+eps)row=i;
   if(row>=0&&g.ys[row+1]!<target-eps){rowSpace[row]!+=target-g.ys[row+1]!;continue pages;}
  }

  // A protected logical row may move, but a spanning cell is not an indivisible group.
  for(let i=0;i<rowIds.length;i++){const r=d.nodes[rowIds[i]!];if(r?.type==='table-row'&&!r.props.allowBreak&&cut>g.ys[i]!+eps&&cut<g.ys[i+1]!-eps)cut=g.ys[i]!;}

  // Group boundaries are indexed once; use existing measured items, never re-wrap.
  for(const entry of starts){
   const start=g.ys[entry.start]!;
   if(entry.relaxed||start<from-eps||start>=cut-eps)continue;
   const row=d.nodes[rowIds[entry.member]!];
   const label=entry.group.groupLabel?labelsById.get(entry.group.groupLabel.cellId):undefined;
   const firstHeight=Math.max(label?labelHeight(label):0,row?.type==='table-row'&&!row.props.allowBreak?g.heights[entry.member]!:Math.max(0,...(cellsByRow.get(entry.member)??[]).map(c=>c.padding.top+(c.lines[0]?.line.heightPt??0)+c.padding.bottom)));
   const end=g.ys[entry.member]!+firstHeight;
   if(cut>=end-eps)continue;
   if(s.bounded){cut=start;break;}
   const nextHeader=t.props.repeatHeaderRows||(first&&start<=from+eps)?headerHeight:0;
   const nextSpace=(s.nextCapacity??(s.bottom-s.top))-nextHeader;
   if(end-start<=nextSpace+eps){cut=start;break;}
   entry.relaxed=true;
   const source=d.sourceMap[t.id];
   s.warn?.({code:'ROW_GROUP_KEEP_START_RELAXED',path:`nodes.${t.id}.rowGroups[${entry.index}]`,nodeId:t.id,groupId:entry.group.groupId,groupIndex:entry.group.groupIndex,
    ...(source?{...(source.sectionId?{sectionId:source.sectionId}:{}),...(source.origin==='authored'?{}:{contentIndex:source.contentIndex,format:source.format})}:{}),
    message:'Group start exceeds usable page capacity; keepStart relaxed for this instance'});
  }
  // A repeated label is an atomic neighbour of this page's first legal member fragment.
  for(const c of body.filter(c=>c.label)){
   const lo=Math.max(from,g.ys[c.row]!),end=g.ys[c.row+c.rowSpan]!;
   if(end<=from+eps||lo>=cut-eps)continue;
   const height=labelHeight(c);
   const remaining=body.filter(v=>!v.label&&v.row>=c.row&&v.row<c.row+c.rowSpan).flatMap(v=>v.lines.filter(l=>!l.drawn).map(l=>g.ys[v.row]!+l.offset+l.line.heightPt+v.padding.bottom));
   const required=Math.max(lo+height,remaining.length?Math.min(...remaining):lo);
   if(Math.min(cut,end)<required-eps){cut=lo;pendingLabel=c;break;}
  }
  const hasLine=pending.some(l=>l.start>=from-eps&&l.end<=cut+eps);
  const startsHere=pending.some(l=>l.start<cut+eps);
  if(cut<=from+eps||(!hasLine&&(startsHere||(hh>0&&pending.length>0)))){
   if(s.bounded)stop(rowIds.some((id,i)=>{const r=d.nodes[id];return r?.type==='table-row'&&!r.props.allowBreak&&g.ys[i]!<=from+eps&&g.ys[i+1]!>from+eps;})?'unbreakable-item-does-not-fit':'height-limit');
   if(s.y>s.top+eps||(s.nextCapacity??0)>s.bottom-s.top+eps){s.nextPage();continue;}throw new LayoutError(t.id,'Merged row made no progress');
  }
  // Keep each cell's next line whole. Carry its remaining offsets into the next
  // fragment; any resulting height deficit still belongs to its ending row.
  let shifted=true;
  while(shifted){shifted=false;
   for(const c of body){const base=g.ys[c.row]!;const index=c.lines.findIndex(l=>!l.drawn&&base+l.offset<cut+c.padding.top-eps&&base+l.offset+l.line.heightPt+c.padding.bottom>cut+eps);
    if(index>=0){const delta=cut+c.padding.top-base-c.lines[index]!.offset;for(const l of c.lines.slice(index))l.offset+=delta;shifted=true;g=geometry();}}
  }
  // Do not paint the empty start of a row whose content all moved forward.
  // Keep the layout cut unchanged: only the visible border/fill ends earlier.
  // Authored empty rows and rows crossed by a rowspan keep their geometry.
  let paintTo=cut;
  for(let row=rowIds.length-1;row>=0;row--){
   const start=g.ys[row]!,end=g.ys[row+1]!;
   if(start>=paintTo-eps||end<=from+eps)continue;
   if(start<from-eps)break;
   const active=body.filter(c=>c.row<=row&&c.row+c.rowSpan>row);
   if(active.some(c=>!c.label&&(c.row!==row||c.rowSpan!==1)))break;
   if(active.some(c=>c.label&&start-Math.max(from,g.ys[c.row]!)<labelHeight(c)-eps))break;
   const lines=active.filter(c=>!c.label).flatMap(c=>c.lines.map(l=>({l,y:start+l.offset})));
   if(!lines.length||lines.some(({l,y})=>l.drawn||(y>=from-eps&&y+l.line.heightPt<=paintTo+eps)))break;
   paintTo=start;
  }
  if(hh)drawHeader();paint(body,g.ys,from,paintTo,s.y,hh>0);s.y+=cut-from;from=cut;first=false;
  if(from<g.ys.at(-1)!-eps){if(s.bounded)stop();s.nextPage();}
 }
 if(body.some(c=>c.lines.some(l=>!l.drawn)))throw new LayoutError(t.id,'Merged table left pending content');
}
