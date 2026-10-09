import type {DocumentNode,Table} from './resolvedDocument.js';
export interface GridCell {id:string;row:number;column:number;rowSpan:number;colSpan:number}
export interface TableGrid {rowIds:string[];columnCount:number;explicit:boolean;cells:GridCell[]}
export class TableGridError extends Error {constructor(public nodeId:string,public property:string){super('Invalid table grid: '+property);}}
export function resolveTableGrid(table:Table,nodes:Record<string,DocumentNode>):TableGrid{
 const bad=(id:string,p:string):never=>{throw new TableGridError(id,p);};
 const cells:GridCell[]=[];let explicit=false,implicit=false;
 table.rowIds.forEach((rid,row)=>{
  const r=nodes[rid];if(r?.type!=='table-row')return bad(rid,'row');
  r.cellIds.forEach((id,index)=>{const c=nodes[id];if(c?.type!=='table-cell')return bad(id,'cell');
   const props=c.props;const placed=['columnIndex','rowSpan','colSpan'].some(key=>Object.hasOwn(props,key));
   if(placed)explicit=true;else implicit=true;
   const column=placed?props.columnIndex:index,rs=props.rowSpan===undefined?1:props.rowSpan,cs=props.colSpan===undefined?1:props.colSpan;
   if(!Number.isSafeInteger(column)||column!<0||!Number.isSafeInteger(rs)||rs<1||!Number.isSafeInteger(cs)||cs<1)return bad(id,'span');
   if(column!+cs>table.columns.length||row+rs>table.rowIds.length)return bad(id,'bounds');
   if(row<table.props.headerRowCount&&row+rs>table.props.headerRowCount)return bad(id,'header');
   cells.push({id,row,column:column!,rowSpan:rs,colSpan:cs});
  });
 });
 if(explicit&&implicit)bad(table.id,'mixed placement');
 // Sweep real rows; never allocate an array using untrusted span values.
 let active:GridCell[]=[];const starts=new Map<number,GridCell[]>();
 for(const c of cells){const list=starts.get(c.row)??[];list.push(c);starts.set(c.row,list);}
 for(let row=0;row<table.rowIds.length;row++){
  active=active.filter(c=>c.row+c.rowSpan>row);active.push(...starts.get(row)??[]);active.sort((a,b)=>a.column-b.column);
  let end=0;for(const c of active){if(c.column!==end)bad(c.id,c.column<end?'overlap':'hole');end=c.column+c.colSpan;}
  if(end!==table.columns.length)bad(table.rowIds[row]!,'coverage');
 }
 return {rowIds:table.rowIds,columnCount:table.columns.length,explicit,cells};
}
