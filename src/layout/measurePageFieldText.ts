import {toPt,type TextBlock,type TextStyle,type TextInline} from '../composition/resolvedDocument.js';
import type {GlyphRun,PageFieldSlot} from '../pdf/drawContract.js';
import {LayoutError,type TextRuntime} from './textFlow.js';
import {measureText} from './measureText.js';
export type RelativePageField=Omit<PageFieldSlot,'pageIndex'|'sectionId'>;
export async function measurePageFieldText(node:TextBlock,style:TextStyle,width:number,runtime:TextRuntime):Promise<{heightPt:number;commands:GlyphRun[];slots:RelativePageField[]}>{
 const commands:GlyphRun[]=[],slots:RelativePageField[]=[];let x=0,y=0,serial=0,pending:TextInline[]=[];
 const newline=()=>{x=0;y+=style.lineHeightPt;};
 const flush=async()=>{if(!pending.length)return;const chunk={...node,children:pending};let lines;
  if(width-x<1e-6)newline();
  try{lines=await measureText(chunk,style,width,runtime,width-x);}catch(e){if(x===0||!(e instanceof LayoutError)||!/whole grapheme/.test(e.message))throw e;newline();lines=await measureText(chunk,style,width,runtime);}
  for(const [i,line] of lines.entries()){if(i)newline();if(line.run){commands.push({...line.run,id:`field-static-${serial++}`,bounds:{...line.run.bounds,xPt:x+line.run.bounds.xPt,yPt:y}});x+=line.occupiedWidthPt??(line.run.bounds.xPt+line.run.bounds.widthPt);}}pending=[];
 };
 for(const c of node.children){if(c.type==='system-page-field'){await flush();const w=toPt(c.width);if(w>width+1e-6)throw new LayoutError(node.id,'Page field slot exceeds band width',undefined,'children.'+c.id);if(x+w>width+1e-6)newline();slots.push({nodeId:node.id,fieldId:c.id,field:c.field,xPt:x,yPt:y,widthPt:w,style});x+=w;}
  else if(c.type==='line-break'){await flush();newline();}else pending.push(c);
 }
 await flush();return {heightPt:y+style.lineHeightPt,commands,slots};
}
