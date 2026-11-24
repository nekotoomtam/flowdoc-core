import {toPt} from '../composition/resolvedDocument.js';
import type {ResolvedDocument,CellPadding} from '../composition/resolvedDocument.js';
import {measureStyledCell} from './measureStyledCell.js';
import {measureText} from './measureText.js';
import type {MeasuredLine} from './measureText.js';
import {LayoutError} from './textFlow.js';
import type {TextRuntime} from './textFlow.js';
export type MeasuredCellItem=
 | {kind:'text-line';nodeId:string;heightPt:number;line:MeasuredLine}
 | {kind:'image-frame';nodeId:string;heightPt:number;frameWidth:number;align:'left'|'center'|'right';resourceId:string};
export interface PaddingPt {top:number;right:number;bottom:number;left:number}
export function resolveCellPadding(padding?:CellPadding):PaddingPt {
 const side=(key:keyof PaddingPt)=>padding?.[key]===undefined?4:toPt(padding[key]);
 return {top:side('top'),right:side('right'),bottom:side('bottom'),left:side('left')};
}
export async function measureCellContent(d:ResolvedDocument,childIds:string[],contentWidth:number,runtime:TextRuntime):Promise<MeasuredCellItem[]> {
 const items:MeasuredCellItem[]=[];
 for(const id of childIds){const n=d.nodes[id];
  if(n?.type==='text-block'){
   const inset=n.props.outline?2:0,width=contentWidth-2*inset;
   if(inset&&width<=0)throw new LayoutError(id,'Text outline exceeds cell content width');
   const lines=n.children.some(c=>c.type==='text'&&c.textStyleId)?await measureStyledCell(n,d.styles,width,runtime):await measureText(n,d.styles[n.props.textStyleId]!,width,runtime);
   for(const measured of lines){
    // Align within the padded cell, using ink bounds rather than character count.
    const remaining=width-(measured.occupiedWidthPt??0),offset=inset+(n.props.textAlign==='center'?remaining/2:n.props.textAlign==='right'?remaining:0);
    if(offset && measured.runs)for(const run of measured.runs)run.bounds.xPt+=offset;
    const line=offset&&measured.run?{...measured,run:{...measured.run,bounds:{...measured.run.bounds,xPt:measured.run.bounds.xPt+offset}}}:measured;
    items.push({kind:'text-line',nodeId:id,heightPt:line.heightPt,line});
   }
  }
  else if(n?.type==='image'){
   const frameWidth=toPt(n.props.width),heightPt=toPt(n.props.height);
   if(frameWidth>contentWidth+1e-6)throw new LayoutError(id,'Image frame exceeds cell content width');
   items.push({kind:'image-frame',nodeId:id,heightPt,frameWidth,align:n.props.align??'left',resourceId:n.props.resourceId});
  }else throw new LayoutError(id,'Expected TextBlock or Image');
 }
 return items;
}
