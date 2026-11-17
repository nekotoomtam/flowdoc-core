import {sourceGraph} from './fields.js';
import {textEnvelope} from './font-envelope.js';
import {required,type ExportIntent} from './types.js';
import {toPoints} from './units.js';
import {tableStrokeEnvelope} from '../composition/strokeStyle.js';

export function bandTableEnvelope(intent:ExportIntent,scope:string,id:string){
 const nodes=sourceGraph(intent,scope),table=nodes[id];
 const grid=required(intent.tables.find(t=>t.nodeId===id&&t.scope===scope),'band.table');
 const heights:number[]=Array(table.rowIds.length).fill(0);
 const merged:{row:number;span:number;extent:number}[]=[];
 let imageReferences=0;
 for(const [row,rid]of table.rowIds.entries()){
  for(const [index,cid]of nodes[rid].cellIds.entries()){
   const cell=nodes[cid],col=cell.props.columnIndex??index,span=cell.props.colSpan??1,rowSpan=cell.props.rowSpan??1;
   const pad=required(grid.cells.find(c=>c.nodeId===cid),'band.cell').paddingTwips;
   const width=(grid.columnTwips.slice(col,col+span).reduce((a,b)=>a+b,0)-pad.left-pad.right)/20;
   let content=0;
   for(const child of cell.childIds){
    const n=nodes[child];
    if(n.type==='image'){imageReferences++;content+=toPoints(n.props.height)+1;}
    else content+=textEnvelope(intent,child,scope,width);
   }
   const extent=(pad.top+pad.bottom)/20+Math.max(content,1);
   if(rowSpan===1)heights[row]=Math.max(heights[row]!,extent);
   else merged.push({row,span:rowSpan,extent});
  }
 }
 merged.sort((a,b)=>a.row+a.span-b.row-b.span);
 for(const {row,span,extent}of merged){
  const end=row+span-1,covered=heights.slice(row,end+1).reduce((a,b)=>a+b,0);
  heights[end]=heights[end]!+Math.max(0,extent-covered);
 }
 const overhead=tableStrokeEnvelope(table)*(heights.length+1);
 return {height:heights.reduce((a,b)=>a+b,0)+overhead,overhead,imageReferences};
}
