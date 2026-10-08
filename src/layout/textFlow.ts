import {measureText} from './measureText.js';
import { toPt } from '../composition/resolvedDocument.js';
import type { ResolvedDocument } from '../composition/resolvedDocument.js';
import type { DrawDocument, DrawPage, Glyph } from '../pdf/drawContract.js';

export interface ShapedText {glyphs:Glyph[];ascentPt:number;descentPt:number;inkLeftPt?:number;inkRightPt?:number}
export interface TextRuntime {
 breaks(text:string):Promise<number[]>;
 shape(text:string,fontId:string,sizePt:number):Promise<ShapedText>;
}
export class LayoutError extends Error {
 constructor(public readonly nodeId:string,message:string){super(message);}
}
export async function textFlow(document:ResolvedDocument,runtime:TextRuntime):Promise<DrawDocument>{
 const page=document.book.page;
 const [w,h]=page.orientation==='portrait'?[210,297]:[297,210];
 const widthPt=w!*72/25.4,heightPt=h!*72/25.4;
 const left=toPt(page.margin.left),right=widthPt-toPt(page.margin.right),top=toPt(page.margin.top),bottom=heightPt-toPt(page.margin.bottom);
 const available=right-left, epsilon=1e-6;
 const pages:DrawPage[]=[];
 const addPage=()=>{const p={widthPt,heightPt,backgroundColor:'FFFFFF',commands:[]} as DrawPage;pages.push(p);return p;};
 let current=addPage(),y=top,serial=0;
 for(const id of document.rootIds){
  const node=document.nodes[id]!;
  if(node.type!=='text-block')throw new LayoutError(id,'Unsupported node type');
  const style=document.styles[node.props.textStyleId]!;
  for(const line of await measureText(node,style,available,runtime)){
   if(line.heightPt>bottom-top+epsilon)throw new LayoutError(id,'Line height exceeds page content area');
   if(y+line.heightPt>bottom+epsilon){current=addPage();y=top;}
   if(line.run)current.commands.push({id:`run-${serial++}`,...line.run,bounds:{...line.run.bounds,xPt:left+line.run.bounds.xPt,yPt:y}});
   y+=line.heightPt;
  }

 }
 return {pages};
}
