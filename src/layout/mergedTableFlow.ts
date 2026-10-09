import {resolveTableGrid} from '../composition/tableGrid.js';
import type {GridCell} from '../composition/tableGrid.js';
import {toPt} from '../composition/resolvedDocument.js';
import type {ResolvedDocument,Table} from '../composition/resolvedDocument.js';
import {measureText} from './measureText.js';
import type {MeasuredLine} from './measureText.js';
import {LayoutError} from './textFlow.js';
import type {TextRuntime} from './textFlow.js';
export interface TablePageSink {top:number;bottom:number;left:number;availableWidth:number;y:number;nextPage():void;emitLine(line:MeasuredLine,x:number,y:number):void;border(x1:number,y1:number,x2:number,y2:number,nodeId:string):void}
interface Cell extends GridCell {lines:{line:MeasuredLine;offset:number;drawn:boolean}[]}
const pad=4,eps=1e-6;
export async function mergedTableFlow(d:ResolvedDocument,t:Table,runtime:TextRuntime,s:TablePageSink):Promise<void>{
 const grid=resolveTableGrid(t,d.nodes),widths=t.columns.map(c=>toPt(c.width));
 if(widths.some(w=>w<=2*pad)||widths.reduce((a,b)=>a+b,0)>s.availableWidth+eps)throw new LayoutError(t.id,'Table columns exceed available content width');
 const xs=[0];for(const w of widths)xs.push(xs.at(-1)!+w);
 const cells:Cell[]=[];
 for(const c of grid.cells){const n=d.nodes[c.id];if(n?.type!=='table-cell')throw new LayoutError(c.id,'Expected cell');
  let offset=pad;const lines:Cell['lines']=[];
  for(const child of n.childIds){const b=d.nodes[child];if(b?.type!=='text-block')throw new LayoutError(child,'Expected TextBlock');
   for(const line of await measureText(b,d.styles[b.props.textStyleId]!,xs[c.column+c.colSpan]!-xs[c.column]!-2*pad,runtime)){lines.push({line,offset,drawn:false});offset+=line.heightPt;}
  }cells.push({...c,lines});
 }
 const headerCount=t.props.headerRowCount,headerCells=cells.filter(c=>c.row<headerCount);
 const body=cells.filter(c=>c.row>=headerCount).map(c=>({...c,row:c.row-headerCount}));
 const rowIds=t.rowIds.slice(headerCount);
 const headerHeight=headerCount?Math.max(2*pad,...headerCells.map(c=>(c.lines.at(-1)?.offset??pad)+(c.lines.at(-1)?.line.heightPt??0)+pad)):0;
 if(headerHeight>s.bottom-s.top+eps)throw new LayoutError(t.id,'Header exceeds page content height');
 const geometry=()=>{const heights=rowIds.map(()=>2*pad),ordered=[...body].sort((a,b)=>a.row+a.rowSpan-b.row-b.rowSpan||a.row-b.row||a.column-b.column);
  for(const c of ordered.filter(c=>c.rowSpan===1))heights[c.row]=Math.max(heights[c.row]!, (c.lines.at(-1)?.offset??pad)+(c.lines.at(-1)?.line.heightPt??0)+pad);
  for(const c of ordered.filter(c=>c.rowSpan>1)){const need=(c.lines.at(-1)?.offset??pad)+(c.lines.at(-1)?.line.heightPt??0)+pad,have=heights.slice(c.row,c.row+c.rowSpan).reduce((a,b)=>a+b,0);if(need>have)heights[c.row+c.rowSpan-1]!+=need-have;}
  const ys=[0];for(const h of heights)ys.push(ys.at(-1)!+h);return {heights,ys};
 };
 const paint=(list:Cell[],ys:number[],from:number,to:number,at:number,sharedTop=false)=>{
  // Union collinear edges: shared or partially shared cell edges are stroked once.
  const edges=new Map<string,{axis:'h'|'v';fixed:number;segments:[number,number][]}>();
  const edge=(axis:'h'|'v',fixed:number,a:number,b:number)=>{if(b-a<eps)return;const key=axis+':'+fixed.toFixed(6),e=edges.get(key)??{axis,fixed,segments:[]};e.segments.push([a,b]);edges.set(key,e);};
  for(const c of list){const start=ys[c.row]!,end=ys[c.row+c.rowSpan]!,lo=Math.max(start,from),hi=Math.min(end,to);if(hi-lo<=eps)continue;
   const x=s.left+xs[c.column]!,right=s.left+xs[c.column+c.colSpan]!,top=at+lo-from,bottom=at+hi-from;
   if(!sharedTop||lo>from+eps)edge('h',top,x,right);edge('h',bottom,x,right);edge('v',x,top,bottom);edge('v',right,top,bottom);
   for(const l of c.lines){const y=start+l.offset;if(!l.drawn&&y>=from-eps&&y+l.line.heightPt<=to+eps){s.emitLine(l.line,x+pad,at+y-from);l.drawn=true;}}
  }
  for(const e of edges.values()){e.segments.sort((a,b)=>a[0]-b[0]);let [a,b]=e.segments[0]!;const emit=()=>e.axis==='h'?s.border(a,e.fixed,b,e.fixed,t.id):s.border(e.fixed,a,e.fixed,b,t.id);
   for(const [lo,hi] of e.segments.slice(1)){if(lo<=b+eps)b=Math.max(b,hi);else{emit();a=lo;b=hi;}}emit();}
 };
 const drawHeader=()=>{for(const c of headerCells)for(const l of c.lines)l.drawn=false;paint(headerCells,[0,headerHeight],0,headerHeight,s.y);s.y+=headerHeight;};
 if(!rowIds.length){if(s.y+headerHeight>s.bottom+eps)s.nextPage();if(headerCount)drawHeader();return;}
 let from=0,first=true;
 while(true){let g=geometry();if(from>=g.ys.at(-1)!-eps)break;
  const hh=first||t.props.repeatHeaderRows?headerHeight:0,capacity=s.bottom-s.y-hh;
  const full=s.bottom-s.top-hh;
  for(const [i,id] of rowIds.entries()){const r=d.nodes[id];if(r?.type==='table-row'&&!r.props.allowBreak&&g.heights[i]!>full+eps)throw new LayoutError(id,'Protected row exceeds page');}
  for(const c of body)for(const l of c.lines)if(!l.drawn&&l.line.heightPt+2*pad>full+eps)throw new LayoutError(c.id,'Next whole line cannot fit with header');
  let cut=Math.min(g.ys.at(-1)!,from+capacity);
  // A protected logical row may move, but a spanning cell is not an indivisible group.
  for(let i=0;i<rowIds.length;i++){const r=d.nodes[rowIds[i]!];if(r?.type==='table-row'&&!r.props.allowBreak&&cut>g.ys[i]!+eps&&cut<g.ys[i+1]!-eps)cut=g.ys[i]!;}
  const pending=body.flatMap(c=>c.lines.filter(l=>!l.drawn).map(l=>({start:g.ys[c.row]!+l.offset,end:g.ys[c.row]!+l.offset+l.line.heightPt})));
  const hasLine=pending.some(l=>l.start>=from-eps&&l.end<=cut+eps);
  const startsHere=pending.some(l=>l.start<cut-eps);
  if(cut<=from+eps||(!hasLine&&startsHere)){
   if(s.y>s.top+eps){s.nextPage();continue;}throw new LayoutError(t.id,'Merged row made no progress');
  }
  // Keep each cell's next line whole. Carry its remaining offsets into the next
  // fragment; any resulting height deficit still belongs to its ending row.
  let shifted=true;
  while(shifted){shifted=false;
   for(const c of body){const base=g.ys[c.row]!;const index=c.lines.findIndex(l=>!l.drawn&&base+l.offset<cut-eps&&base+l.offset+l.line.heightPt>cut+eps);
    if(index>=0){const delta=cut+pad-base-c.lines[index]!.offset;for(const l of c.lines.slice(index))l.offset+=delta;shifted=true;g=geometry();}}
  }
  if(hh)drawHeader();paint(body,g.ys,from,cut,s.y,hh>0);s.y+=cut-from;from=cut;first=false;
  if(from<g.ys.at(-1)!-eps)s.nextPage();
 }
 if(body.some(c=>c.lines.some(l=>!l.drawn)))throw new LayoutError(t.id,'Merged table left pending content');
}
