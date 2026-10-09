import type {ContentsBlock,TextStyle,TextBlock} from '../composition/resolvedDocument.js';
import type {ContentsEntry} from '../composition/contents.js';
import type {MeasuredLine} from './measureText.js';
import {measureText} from './measureText.js';
import {LayoutError} from './textFlow.js';
import type {TextRuntime} from './textFlow.js';
export const CONTENTS_INDENT_PT=12,CONTENTS_GAP_PT=12,CONTENTS_NUMBER_WIDTH_PT=36;
export interface ContentsLine {line:MeasuredLine;xOffsetPt:number;numberSlot?:{anchorId:string;style:TextStyle;widthPt:number}}
export async function measureContents(node:ContentsBlock,entries:ContentsEntry[],style:TextStyle,available:number,runtime:TextRuntime):Promise<ContentsLine[]>{
 const out:ContentsLine[]=[];
 for(const [index,entry] of entries.entries()){
  const xOffsetPt=(entry.level-1)*CONTENTS_INDENT_PT,width=available-xOffsetPt-CONTENTS_GAP_PT-CONTENTS_NUMBER_WIDTH_PT;
  if(width<=0)throw new LayoutError(node.id,'No contents title width remains');
  const text:TextBlock={id:node.id,type:'text-block',role:{role:'paragraph'},props:{textStyleId:node.props.textStyleId},children:[{id:`contents-title-${index}`,type:'reference',text:entry.title,target:entry.anchorId}]};
  const lines=await measureText(text,style,width,runtime);
  for(const [i,line] of lines.entries())out.push({line,xOffsetPt,...(i===0?{numberSlot:{anchorId:entry.anchorId,style,widthPt:CONTENTS_NUMBER_WIDTH_PT}}:{})});
 }
 return out;
}
