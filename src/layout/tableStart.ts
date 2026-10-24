import type {ResolvedDocument,Table}from'../composition/resolvedDocument.js';
import {toPt}from'../composition/resolvedDocument.js';
import {resolveTableGrid}from'../composition/tableGrid.js';
import {measureCellContent}from'./measureCellContent.js';
import {nativeTableProbe}from'./nativeTableProbe.js';
import {LayoutError,type TextRuntime}from'./textFlow.js';

/** Probe only: complete headers and the first legal body fragment, never a whole
 * breakable long row. Reuses the current PDF metrics without altering row space. */
export async function tableStartHeight(d:ResolvedDocument,t:Table,runtime:TextRuntime):Promise<number>{
 const grid=resolveTableGrid(t,d.nodes),widths=t.columns.map(c=>toPt(c.width));
 const count=Math.min(grid.rowIds.length,t.props.headerRowCount+1),heights=Array.from({length:count},()=>0);
 for(const c of grid.cells.filter(c=>c.row<count)){
  if(c.rowSpan!==1)throw new LayoutError(t.id,'Table-start probe group requires unmerged rows');
  const n=d.nodes[c.id];if(n?.type!=='table-cell')throw new LayoutError(c.id,'Expected table-start cell');
  const probe=nativeTableProbe(t.id,n,runtime),pad=probe.padding,width=widths.slice(c.column,c.column+c.colSpan).reduce((a,b)=>a+b,0)-pad.left-pad.right;
  const items=(await measureCellContent(d,n.childIds,width,runtime)).map(probe.item),row=d.nodes[grid.rowIds[c.row]!];
  const partial=c.row>=t.props.headerRowCount&&row?.type==='table-row'&&row.props.allowBreak;
  const first=items[0],second=items[1];
  const paragraphLines=first?.kind==='text-line'?items.findIndex(item=>item.kind!=='text-line'||item.nodeId!==first.nodeId):0;
  const paragraphCount=paragraphLines<0?items.length:paragraphLines;
  const minimum=first?.kind==='text-line'&&second?.kind==='text-line'&&first.nodeId===second.nodeId&&runtime.spacingProbe?.paragraphWidowOrphan?.(first.nodeId)?(paragraphCount===3?3:2):1;
  const content=(partial?items.slice(0,minimum):items).reduce((sum,item)=>sum+item.heightPt,0);
  heights[c.row]=Math.max(heights[c.row]!,pad.top+content+pad.bottom);
 }
 const stroke=runtime.spacingProbe?.rowStrokePt?.(t.id)??0;
 return heights.reduce((sum,h)=>sum+h+stroke,0);
}
