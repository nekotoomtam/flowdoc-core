import {measureRule} from './line.js';
import {strokePaintProps} from '../composition/strokeStyle.js';
import {measurePageFieldText,type RelativePageField} from './measurePageFieldText.js';
import type {ResolvedBand,TextStyle} from '../composition/resolvedDocument.js';
import {toPt} from '../composition/resolvedDocument.js';
import type {BandMode} from '../template/types.js';
import type {GlyphRun,DrawImage} from '../pdf/drawContract.js';
import type {PdfImageMetadata} from '../pdf/streamResources.js';
import {LayoutError,type TextRuntime} from './textFlow.js';
import {measureText} from './measureText.js';
export interface MeasuredBand {borders:import("../pdf/drawContract.js").Border[];heightPt:number;commands:GlyphRun[];images:DrawImage[];pageFields:RelativePageField[];numberBlocks:Set<string>;pageTexts:Omit<import('../pdf/drawContract.js').PageText,'pageIndex'|'sectionId'>[]}
export function selectPageBands(modes:{headerMode?:BandMode;footerMode?:BandMode},role:string,index:number):{header:boolean;footer:boolean}{
 const show=(mode:BandMode='all')=>role==='body'&&(mode==='all'||mode==='first'&&index===0||mode==='continuation'&&index>0);
 return {header:show(modes.headerMode),footer:show(modes.footerMode)};
}
export async function measurePageBand(b:ResolvedBand,styles:Record<string,TextStyle>,widthPt:number,runtime:TextRuntime,images:PdfImageMetadata):Promise<MeasuredBand>{
 const out:MeasuredBand={borders:[],heightPt:0,commands:[],images:[],pageFields:[],pageTexts:[],numberBlocks:new Set()};let serial=0;
 const stack=async(ids:string[],x:number,y:number,width:number):Promise<number>=>{let at=y;for(const id of ids){const n=b.nodes[id]!;
  if(n.type==='columns'){const gap=n.props.gap?toPt(n.props.gap):0,remaining=width-gap*(n.columns.length-1),weight=n.columns.reduce((s,c)=>s+c.weight,0);if(remaining<=0||!Number.isFinite(weight))throw new LayoutError(id,'Columns exceed page band width');let cx=x,high=0;for(const c of n.columns){const cw=remaining*c.weight/weight;high=Math.max(high,await stack(c.childIds,cx,at,cw));cx+=cw+gap;}at+=high;}
  else if(n.type==='line'){const m=measureRule(n,width);if(m.stroke.style!=='none'){
   const inset=m.stroke.style==='dotted'?m.stroke.widthPt/2:0;if(inset&&m.width<=inset*2)throw new LayoutError(id,'Stroke exceeds page band line width');
   out.borders.push({nodeId:id,x1Pt:x+m.offset+inset,x2Pt:x+m.offset+m.width-inset,y1Pt:at+m.before+m.thickness/2,y2Pt:at+m.before+m.thickness/2,...strokePaintProps(m.stroke)});
  }at+=m.height;}
  else if(n.type==='text-block'&&n.props.pageFieldLayout==='compact'){out.numberBlocks.add(n.id);const style=styles[n.props.textStyleId]!;out.pageTexts.push({node:n,style,xPt:x,yPt:at,widthPt:width});at+=style.lineHeightPt;}
  else if(n.type==='text-block'&&n.children.some(c=>c.type==='system-page-field')){out.numberBlocks.add(n.id);const m=await measurePageFieldText(n,styles[n.props.textStyleId]!,width,runtime);for(const run of m.commands)out.commands.push({...run,id:`band-run-${serial++}`,bounds:{...run.bounds,xPt:x+run.bounds.xPt,yPt:at+run.bounds.yPt}});for(const slot of m.slots)out.pageFields.push({...slot,xPt:x+slot.xPt,yPt:at+slot.yPt});at+=m.heightPt;}
  else if(n.type==='text-block'){for(const line of await measureText(n,styles[n.props.textStyleId]!,width,runtime)){if(line.run)out.commands.push({...line.run,id:`band-run-${serial++}`,bounds:{...line.run.bounds,xPt:x+line.run.bounds.xPt+(n.props.textAlign==='center'?(width-(line.occupiedWidthPt??0))/2:n.props.textAlign==='right'?width-(line.occupiedWidthPt??0):0),yPt:at}});at+=line.heightPt;}}
  else {const fw=toPt(n.props.width),fh=toPt(n.props.height);if(fw>width+1e-6)throw new LayoutError(id,'Image frame exceeds page band width');const image=Object.hasOwn(images,n.props.resourceId)?images[n.props.resourceId]:undefined;if(image){const scale=Math.min(fw/image.width,fh/image.height),w=image.width*scale,h=image.height*scale,dx=n.props.align==='right'?width-fw:n.props.align==='center'?(width-fw)/2:0;out.images.push({nodeId:id,resourceId:n.props.resourceId,xPt:x+dx+(fw-w)/2,yPt:at+(fh-h)/2,widthPt:w,heightPt:h});}at+=fh;}
 }return at-y;};
 const measured=await stack(b.rootIds,0,0,widthPt),minimum=styles[b.baseTextStyleId]!.lineHeightPt,s=b.sizing;
 out.heightPt=Math.max(measured,minimum,s?.mode==='content'&&s.minHeight?toPt(s.minHeight):0);
 const ceiling=s?.mode==='fixed'?toPt(s.height):s?.mode==='content'&&s.maxHeight?toPt(s.maxHeight):Infinity;
 if(out.heightPt>ceiling+1e-6)throw new LayoutError(b.rootIds[0]??'page-band','Page band exceeds configured height');
 if(s?.mode==='fixed')out.heightPt=ceiling;
 return out;
}
