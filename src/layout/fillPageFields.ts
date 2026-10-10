import type {DrawDocument} from '../pdf/drawContract.js';
import {LayoutError,type TextRuntime} from './textFlow.js';
import {measureNumber} from './fillContentsNumbers.js';
export async function fillPageFields(draw:DrawDocument,runtime:TextRuntime):Promise<void>{
 for(const [i,slot] of (draw.pageFieldSlots??[]).entries()){
  const page=draw.pages[slot.pageIndex],n=page?.pageNumbering;
  if(!n)throw new LayoutError(slot.nodeId,'Missing system page metadata',slot.sectionId,'children.'+slot.fieldId);
  if(n.visibility==='hide')continue;
  const value=n[slot.field];if(value===null)throw new LayoutError(slot.nodeId,'Current number is undefined on excluded page',slot.sectionId,'children.'+slot.fieldId);
  try{const run=await measureNumber(slot.nodeId,String(value),slot.style,slot.widthPt,runtime);page.commands.push({...run,id:`system-page-${i}`,bounds:{...run.bounds,xPt:slot.xPt+run.bounds.xPt,yPt:slot.yPt}});}catch(e){if(e instanceof LayoutError)throw new LayoutError(slot.nodeId,e.message,slot.sectionId,'children.'+slot.fieldId);throw e;}
 }
 delete draw.pageFieldSlots;
}
