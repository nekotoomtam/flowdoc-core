import {toPt} from '../composition/resolvedDocument.js';
import type {TextBlock,TextStyle} from '../composition/resolvedDocument.js';
import {measureText} from './measureText.js';
import type {MeasuredLine} from './measureText.js';
import {LayoutError} from './textFlow.js';
import type {TextRuntime} from './textFlow.js';
export async function measureFixedTextBlock(node:TextBlock,style:TextStyle,widthPt:number,runtime:TextRuntime):Promise<{lines:MeasuredLine[];heightPt:number;offsetPt:number}>{
 const heightPt=toPt(node.props.height!);
 const lines=node.children.length?await measureText(node,style,widthPt,runtime):[];
 const used=lines.reduce((sum,line)=>sum+line.heightPt,0);
 if(used>heightPt+1e-6)throw new LayoutError(node.id,'Text exceeds reserved height');
 const remaining=Math.max(0,heightPt-used);
 return {lines,heightPt,offsetPt:node.props.verticalAlign==='bottom'?remaining:node.props.verticalAlign==='center'?remaining/2:0};
}
