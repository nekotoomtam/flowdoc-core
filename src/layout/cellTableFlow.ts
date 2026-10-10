import {resolveTableGrid} from '../composition/tableGrid.js';
import type {GridCell} from '../composition/tableGrid.js';
import {toPt} from '../composition/resolvedDocument.js';
import type {ResolvedDocument,Table} from '../composition/resolvedDocument.js';
import {measureCellContent,resolveCellPadding} from './measureCellContent.js';
import type {MeasuredCellItem,PaddingPt} from './measureCellContent.js';

import {LayoutError} from './textFlow.js';
import type {TextRuntime} from './textFlow.js';
export interface CellTablePageSink {top:number;bottom:number;nextCapacity?:number;left:number;availableWidth:number;y:number;nextPage():void;emitItem(item:MeasuredCellItem,x:number,y:number,width:number):void;border(x1:number,y1:number,x2:number,y2:number,nodeId:string):void}
interface Cell extends GridCell {padding:PaddingPt;contentWidth:number;lines:{line:MeasuredCellItem;offset:number;drawn:boolean}[]}
const eps=1e-6;
export async function cellTableFlow(d:ResolvedDocument,t:Table,runtime:TextRuntime,s:CellTablePageSink):Promise<void>{
 const grid=resolveTableGrid(t,d.nodes),widths=t.columns.map(c=>toPt(c.width));
 if(widths.some(w=>w<=0)||widths.reduce((a,b)=>a+b,0)>s.availableWidth+eps)throw new LayoutError(t.id,'Table columns exceed available content width');
 const xs=[0];for(const w of widths)xs.push(xs.at(-1)!+w);
 const cells:Cell[]=[];
 for(const c of grid.cells){const n=d.nodes[c.id];if(n?.type!=='table-cell')throw new LayoutError(c.id,'Expected cell');
  const padding=resolveCellPadding(n.props.padding),contentWidth=xs[c.column+c.colSpan]!-xs[c.column]!-padding.left-padding.right;
  if(Object.values(padding).some(v=>!Number.isFinite(v)||v<0))throw new LayoutError(c.id,'Invalid converted cell padding');
  if(!Number.isFinite(contentWidth)||contentWidth<=0)throw new LayoutError(c.id,'Cell padding leaves no content width');
  let offset=padding.top;const lines:Cell['lines']=[];
  for(const line of await measureCellContent(d,n.childIds,contentWidth,runtime)){lines.push({line,offset,drawn:false});offset+=line.heightPt;}
  cells.push({...c,padding,contentWidth,lines});
 }
 const headerCount=t.props.headerRowCount,headerCells=cells.filter(c=>c.row<headerCount);
 const body=cells.filter(c=>c.row>=headerCount).map(c=>({...c,row:c.row-headerCount}));
 const rowIds=t.rowIds.slice(headerCount);
 const headerHeight=headerCount?Math.max(0,...headerCells.map(c=>(c.lines.at(-1)?.offset??c.padding.top)+(c.lines.at(-1)?.line.heightPt??0)+c.padding.bottom)):0;
 if(headerHeight>Math.max(s.bottom-s.top,s.nextCapacity??0)+eps)throw new LayoutError(t.id,'Header exceeds page content height');
 const geometry=()=>{const heights=rowIds.map(()=>0),ordered=[...body].sort((a,b)=>a.row+a.rowSpan-b.row-b.rowSpan||a.row-b.row||a.column-b.column);
  for(const c of ordered.filter(c=>c.rowSpan===1))heights[c.row]=Math.max(heights[c.row]!, (c.lines.at(-1)?.offset??c.padding.top)+(c.lines.at(-1)?.line.heightPt??0)+c.padding.bottom);
  for(const c of ordered.filter(c=>c.rowSpan>1)){const need=(c.lines.at(-1)?.offset??c.padding.top)+(c.lines.at(-1)?.line.heightPt??0)+c.padding.bottom,have=heights.slice(c.row,c.row+c.rowSpan).reduce((a,b)=>a+b,0);if(need>have)heights[c.row+c.rowSpan-1]!+=need-have;}
  const ys=[0];for(const h of heights)ys.push(ys.at(-1)!+h);return {heights,ys};
 };
 const paint=(list:Cell[],ys:number[],from:number,to:number,at:number,sharedTop=false)=>{
  // Union collinear edges: shared or partially shared cell edges are stroked once.
  const edges=new Map<string,{axis:'h'|'v';fixed:number;segments:[number,number][]}>();
  const edge=(axis:'h'|'v',fixed:number,a:number,b:number)=>{if(b-a<eps)return;const key=axis+':'+fixed.toFixed(6),e=edges.get(key)??{axis,fixed,segments:[]};e.segments.push([a,b]);edges.set(key,e);};
  for(const c of list){const start=ys[c.row]!,end=ys[c.row+c.rowSpan]!,lo=Math.max(start,from),hi=Math.min(end,to);if(hi-lo<=eps)continue;
   const x=s.left+xs[c.column]!,right=s.left+xs[c.column+c.colSpan]!,top=at+lo-from,bottom=at+hi-from;
   if(!sharedTop||lo>from+eps)edge('h',top,x,right);edge('h',bottom,x,right);edge('v',x,top,bottom);edge('v',right,top,bottom);
   for(const l of c.lines){const y=start+l.offset;if(!l.drawn&&y>=from-eps&&y+l.line.heightPt<=to+eps){s.emitItem(l.line,x+c.padding.left,at+y-from,c.contentWidth);l.drawn=true;}}
  }
  for(const e of edges.values()){e.segments.sort((a,b)=>a[0]-b[0]);let [a,b]=e.segments[0]!;const emit=()=>e.axis==='h'?s.border(a,e.fixed,b,e.fixed,t.id):s.border(e.fixed,a,e.fixed,b,t.id);
   for(const [lo,hi] of e.segments.slice(1)){if(lo<=b+eps)b=Math.max(b,hi);else{emit();a=lo;b=hi;}}emit();}
 };
 const drawHeader=()=>{for(const c of headerCells)for(const l of c.lines)l.drawn=false;paint(headerCells,[0,headerHeight],0,headerHeight,s.y);s.y+=headerHeight;};
 const fullBodyHeight=Math.max(s.bottom-s.top,s.nextCapacity??0)-(t.props.repeatHeaderRows?headerHeight:0);
 for(const c of body)if(c.padding.top+c.padding.bottom>fullBodyHeight+eps)throw new LayoutError(c.id,'Cell padding exceeds printable page');
 if(!rowIds.length||geometry().ys.at(-1)!<=eps){if(s.y+headerHeight>s.bottom+eps)s.nextPage();if(headerCount)drawHeader();return;}
 let from=0,first=true;
 while(true){let g=geometry();if(from>=g.ys.at(-1)!-eps)break;
  const hh=first||t.props.repeatHeaderRows?headerHeight:0,capacity=s.bottom-s.y-hh;
  const full=Math.max(s.bottom-s.top,s.nextCapacity??0)-(t.props.repeatHeaderRows?headerHeight:0);
  for(const [i,id] of rowIds.entries()){const r=d.nodes[id];if(r?.type==='table-row'&&!r.props.allowBreak&&g.heights[i]!>full+eps)throw new LayoutError(id,'Protected row exceeds page');}
  for(const c of body)for(const l of c.lines)if(!l.drawn&&l.line.heightPt+c.padding.top+c.padding.bottom>full+eps)throw new LayoutError(l.line.nodeId,l.line.kind==='image-frame'?'Image frame cannot fit with table header and padding':'Next whole line cannot fit with header');
  let cut=Math.min(g.ys.at(-1)!,from+capacity);
  const pending=body.flatMap(c=>c.lines.filter(l=>!l.drawn).map(l=>({start:g.ys[c.row]!+l.offset,end:g.ys[c.row]!+l.offset+l.line.heightPt+c.padding.bottom})));
  // Carry the final line with trailing padding rather than create an empty
  // continuation page. Preserve padding instead of clipping the cell rectangle.
  if(cut<g.ys.at(-1)!-eps&&pending.length&&pending.every(l=>l.end<=cut+eps))cut=Math.min(cut,Math.max(...pending.map(l=>l.start)));

  // A protected logical row may move, but a spanning cell is not an indivisible group.
  for(let i=0;i<rowIds.length;i++){const r=d.nodes[rowIds[i]!];if(r?.type==='table-row'&&!r.props.allowBreak&&cut>g.ys[i]!+eps&&cut<g.ys[i+1]!-eps)cut=g.ys[i]!;}

  const hasLine=pending.some(l=>l.start>=from-eps&&l.end<=cut+eps);
  const startsHere=pending.some(l=>l.start<cut+eps);
  if(cut<=from+eps||(!hasLine&&startsHere)){
   if(s.y>s.top+eps||(s.nextCapacity??0)>s.bottom-s.top+eps){s.nextPage();continue;}throw new LayoutError(t.id,'Merged row made no progress');
  }
  // Keep each cell's next line whole. Carry its remaining offsets into the next
  // fragment; any resulting height deficit still belongs to its ending row.
  let shifted=true;
  while(shifted){shifted=false;
   for(const c of body){const base=g.ys[c.row]!;const index=c.lines.findIndex(l=>!l.drawn&&base+l.offset<cut+c.padding.top-eps&&base+l.offset+l.line.heightPt+c.padding.bottom>cut+eps);
    if(index>=0){const delta=cut+c.padding.top-base-c.lines[index]!.offset;for(const l of c.lines.slice(index))l.offset+=delta;shifted=true;g=geometry();}}
  }
  if(hh)drawHeader();paint(body,g.ys,from,cut,s.y,hh>0);s.y+=cut-from;from=cut;first=false;
  if(from<g.ys.at(-1)!-eps)s.nextPage();
 }
 if(body.some(c=>c.lines.some(l=>!l.drawn)))throw new LayoutError(t.id,'Merged table left pending content');
}
