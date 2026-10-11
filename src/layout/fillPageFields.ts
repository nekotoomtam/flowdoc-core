import type {DrawDocument} from '../pdf/drawContract.js';
import {LayoutError,type TextRuntime} from './textFlow.js';
import {measureText} from './measureText.js';
import {toPt,type TextInline} from '../composition/resolvedDocument.js';
import {measureNumber} from './fillContentsNumbers.js';
export async function fillPageFields(draw:DrawDocument,runtime:TextRuntime):Promise<void>{
 for(const [i,slot] of (draw.pageFieldSlots??[]).entries()){
  const page=draw.pages[slot.pageIndex],n=page?.pageNumbering;
  if(!n)throw new LayoutError(slot.nodeId,'Missing system page metadata',slot.sectionId,'children.'+slot.fieldId);
  if(n.visibility==='hide')continue;
  const value=n[slot.field];if(value===null)throw new LayoutError(slot.nodeId,'Current number is undefined on excluded page',slot.sectionId,'children.'+slot.fieldId);
  try{const run=await measureNumber(slot.nodeId,String(value),slot.style,slot.widthPt,runtime);page.commands.push({...run,id:`system-page-${i}`,bounds:{...run.bounds,xPt:slot.xPt+run.bounds.xPt,yPt:slot.yPt}});}catch(e){if(e instanceof LayoutError)throw new LayoutError(slot.nodeId,e.message,slot.sectionId,'children.'+slot.fieldId);throw e;}
 }
 // Compact fields reserve one line during pagination, then shape their final text.
 // Overflow is an error: silently wrapping here would invalidate the body layout.
 for(const [i,t] of (draw.pageTexts??[]).entries()){
  const page=draw.pages[t.pageIndex],n=page?.pageNumbering;
  if(!n)throw new LayoutError(t.node.id,'Missing system page metadata',t.sectionId);
  if(n.visibility==='hide')continue;
  const children:TextInline[]=[];
  for(const c of t.node.children){
   if(c.type!=='system-page-field'){children.push(c);continue;}
   const value=n[c.field];
   if(value===null)throw new LayoutError(t.node.id,'Current number is undefined on excluded page',t.sectionId,'children.'+c.id);
   try{await measureNumber(t.node.id,String(value),t.style,toPt(c.width),runtime);}
   catch(e){if(e instanceof LayoutError)throw new LayoutError(t.node.id,e.message,t.sectionId,'children.'+c.id);throw e;}
   children.push({id:c.id,type:'text',text:String(value)});
  }
  const lines=await measureText({...t.node,children},t.style,t.widthPt,runtime);
  if(lines.length!==1)throw new LayoutError(t.node.id,'Compact page text must fit one reserved line',t.sectionId,'props.pageFieldLayout');
  const line=lines[0]!;if(!line.run)continue;
  const width=line.occupiedWidthPt??0,offset=t.node.props.textAlign==='center'?(t.widthPt-width)/2:t.node.props.textAlign==='right'?t.widthPt-width:0;
  page.commands.push({...line.run,id:`system-page-text-${i}`,bounds:{...line.run.bounds,xPt:t.xPt+offset+line.run.bounds.xPt,yPt:t.yPt}});
 }
 delete draw.pageTexts;
 delete draw.pageFieldSlots;
}
