import type {TableCell} from '../composition/resolvedDocument.js';
import {resolveCellPadding,type MeasuredCellItem} from './measureCellContent.js';
import {LayoutError,type TextRuntime} from './textFlow.js';

/** Experimental native border-centre envelope. No source or default mutation. */
export function nativeTableProbe(tableId:string,cell:TableCell,runtime:TextRuntime){
 const box=runtime.spacingProbe?.nativeTableBox?.(tableId),padding=resolveCellPadding(cell.props.padding);
 if(box&&(!Number.isFinite(box.borderPt)||box.borderPt<0||box.borderPt>1))throw new LayoutError(tableId,'Invalid native table border');
 if(box){padding.top+=box.borderPt/2;padding.bottom+=box.borderPt/2;}
 const item=(v:MeasuredCellItem):MeasuredCellItem=>{
  if(!box?.quantizeTextToTwips||v.kind!=='text-line')return v;
  const heightPt=Math.round(v.heightPt*20)/20;
  if(heightPt<=0)throw new LayoutError(v.nodeId,'Invalid native table line height');
  return {...v,heightPt,line:{...v.line,heightPt}};
 };
 return {padding,item};
}
