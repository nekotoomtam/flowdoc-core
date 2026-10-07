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
  const node=document.nodes[id]!,style=document.styles[node.props.textStyleId]!;
  const fontId=style.fontWeight==='bold'?(style.fontStyle==='italic'?'font-bold-italic':'font-bold'):(style.fontStyle==='italic'?'font-italic':'font-regular');
  const size=style.fontSize.value,lineHeight=style.lineHeightPt;
  if(lineHeight>bottom-top+epsilon)throw new LayoutError(id,'Line height exceeds page content area');
  const cache=new Map<string,ShapedText>();
  const shape=async(text:string)=>{if(!cache.has(text))cache.set(text,await runtime.shape(text,fontId,size));return cache.get(text)!;};
  const extent=(s:ShapedText)=>Math.max(s.glyphs.reduce((a,g)=>a+g.advancePt,0),s.inkRightPt??0)-Math.min(0,s.inkLeftPt??0);
  const emit=async(text:string)=>{
   if(y+lineHeight>bottom+epsilon){current=addPage();y=top;}
   if(text){
    const shaped=await shape(text),advance=shaped.glyphs.reduce((a,g)=>a+g.advancePt,0);
    if(extent(shaped)>available+epsilon||shaped.ascentPt+shaped.descentPt>lineHeight+epsilon)throw new LayoutError(id,'Text ink does not fit the configured line');
    current.commands.push({id:`run-${serial++}`,nodeId:id,kind:'glyph-run',text,fontId,fontSizePt:size,lineHeightPt:lineHeight,baselineOffsetPt:shaped.ascentPt+(lineHeight-shaped.ascentPt-shaped.descentPt)/2,color:'000000',bounds:{xPt:left-Math.min(0,shaped.inkLeftPt??0),yPt:y,widthPt:advance,heightPt:lineHeight},glyphs:shaped.glyphs});
   }
   y+=lineHeight;
  };
  const text=node.children.map(c=>c.type==='text'?c.text:'\n').join('').replace(/\r\n?/g,'\n');
  for(const paragraph of text.split('\n')){
   if(!paragraph){await emit('');continue;}
   const breaks=[...new Set([...(await runtime.breaks(paragraph)),paragraph.length])].sort((a,b)=>a-b);
   let start=0;
   while(start<paragraph.length){
    let end=start;
    for(const boundary of breaks){
     if(boundary<=start)continue;
     if(extent(await shape(paragraph.slice(start,boundary)))<=available+epsilon)end=boundary;else break;
    }
    if(end===start){
     const firstBreak=breaks.find(b=>b>start)!;
     for(const part of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(paragraph.slice(start,firstBreak))){
      const boundary=start+part.index+part.segment.length;
      if(extent(await shape(paragraph.slice(start,boundary)))<=available+epsilon)end=boundary;else break;
     }
    }
    if(end===start)throw new LayoutError(id,'A whole grapheme cannot fit the content width');
    await emit(paragraph.slice(start,end));start=end;
   }
  }
 }
 return {pages};
}
