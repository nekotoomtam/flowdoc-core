import type {TextStyle} from '../composition/resolvedDocument.js';
import type {DrawDocument,GlyphRun} from '../pdf/drawContract.js';
import {LayoutError} from './textFlow.js';
import type {TextRuntime} from './textFlow.js';
// A fixed number slot never wraps. Right alignment includes actual ink bearings.
export async function measureNumber(nodeId:string,text:string,style:TextStyle,widthPt:number,runtime:TextRuntime):Promise<Omit<GlyphRun,'id'>>{
 const fontId=style.fontWeight==='bold'?(style.fontStyle==='italic'?'font-bold-italic':'font-bold'):(style.fontStyle==='italic'?'font-italic':'font-regular');
 const shaped=await runtime.shape(text,fontId,style.fontSize.value),advance=shaped.glyphs.reduce((sum,g)=>sum+g.advancePt,0),left=Math.min(0,shaped.inkLeftPt??0),right=Math.max(advance,shaped.inkRightPt??0);
 if(right-left>widthPt+1e-6||shaped.ascentPt+shaped.descentPt>style.lineHeightPt+1e-6)throw new LayoutError(nodeId,'Page number ink does not fit the reserved slot');
 return {nodeId,kind:'glyph-run',text,fontId,fontSizePt:style.fontSize.value,lineHeightPt:style.lineHeightPt,baselineOffsetPt:shaped.ascentPt+(style.lineHeightPt-shaped.ascentPt-shaped.descentPt)/2,color:'000000',bounds:{xPt:widthPt-right,yPt:0,widthPt:advance,heightPt:style.lineHeightPt},glyphs:shaped.glyphs,...(shaped.glyphInkBoundsPt?{glyphInkBoundsPt:shaped.glyphInkBoundsPt}:{})};
}
export async function fillContentsNumbers(draw:DrawDocument,anchors:NonNullable<DrawDocument['anchors']>,runtime:TextRuntime,systemNumbers=false):Promise<void>{
 for(const [i,slot] of (draw.contentsSlots??[]).entries()){
  const target=anchors[slot.anchorId];if(!target)throw new LayoutError(slot.nodeId,'Missing contents destination');
  const page=draw.pages[target.pageIndex];
  if(systemNumbers&&!page?.pageNumbering)throw new LayoutError(slot.nodeId,'Missing contents target numbering metadata');
  // Excluded pages retain their title link and reserved number-column geometry.
  if(systemNumbers&&page!.pageNumbering!.current===null)continue;
  const text=String(systemNumbers?page!.pageNumbering!.current:page!.countedPageNumber??target.pageIndex+1),id=`contents-number-${i}`,run=await measureNumber(slot.nodeId,text,slot.style,slot.widthPt,runtime);
  draw.pages[slot.pageIndex]!.commands.push({...run,id,bounds:{...run.bounds,xPt:slot.xPt+run.bounds.xPt,yPt:slot.yPt},sourceStart:0,links:[{id,start:0,end:text.length,link:{type:'reference',text,target:slot.anchorId}}]});
 }
 delete draw.contentsSlots;
}
