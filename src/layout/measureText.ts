import type {TextBlock,TextStyle} from '../composition/resolvedDocument.js';
import type {GlyphRun} from '../pdf/drawContract.js';
import type {TextRuntime,ShapedText} from './textFlow.js';
import {LayoutError} from './textFlow.js';
export interface MeasuredLine {heightPt:number;run?:Omit<GlyphRun,'id'>}
export async function measureText(node:TextBlock,style:TextStyle,available:number,runtime:TextRuntime):Promise<MeasuredLine[]>{
 const id=node.id,epsilon=1e-6,size=style.fontSize.value,lineHeight=style.lineHeightPt;
 const fontId=style.fontWeight==='bold'?(style.fontStyle==='italic'?'font-bold-italic':'font-bold'):(style.fontStyle==='italic'?'font-italic':'font-regular');
 if(available<=0)throw new LayoutError(id,'No content width');
  const cache=new Map<string,ShapedText>();
  const shape=async(text:string)=>{if(!cache.has(text))cache.set(text,await runtime.shape(text,fontId,size));return cache.get(text)!;};
  const extent=(s:ShapedText)=>Math.max(s.glyphs.reduce((a,g)=>a+g.advancePt,0),s.inkRightPt??0)-Math.min(0,s.inkLeftPt??0);
  const lines:MeasuredLine[]=[];
  const emit=async(text:string)=>{
   if(!text){lines.push({heightPt:lineHeight});return;}
   const shaped=await shape(text),advance=shaped.glyphs.reduce((a,g)=>a+g.advancePt,0);
   if(extent(shaped)>available+epsilon||shaped.ascentPt+shaped.descentPt>lineHeight+epsilon)throw new LayoutError(id,'Text ink does not fit the configured line');
   lines.push({heightPt:lineHeight,run:{nodeId:id,kind:'glyph-run',text,fontId,fontSizePt:size,lineHeightPt:lineHeight,baselineOffsetPt:shaped.ascentPt+(lineHeight-shaped.ascentPt-shaped.descentPt)/2,color:'000000',bounds:{xPt:-Math.min(0,shaped.inkLeftPt??0),yPt:0,widthPt:advance,heightPt:lineHeight},glyphs:shaped.glyphs}});
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
 return lines;
}
