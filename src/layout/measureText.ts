import {linkLabel} from '../composition/linkContract.js';
import type {LinkSpan} from '../pdf/drawContract.js';
import type {TextBlock,TextStyle} from '../composition/resolvedDocument.js';
import type {GlyphRun} from '../pdf/drawContract.js';
import type {TextRuntime,ShapedText} from './textFlow.js';
import {LayoutError} from './textFlow.js';
export interface MeasuredLine {heightPt:number;run?:Omit<GlyphRun,'id'>}
export async function measureText(node:TextBlock,style:TextStyle,available:number,runtime:TextRuntime):Promise<MeasuredLine[]>{
 let raw='',rawSpans:LinkSpan[]=[];
 for(const c of node.children){const start=raw.length;raw+=c.type==='text'?c.text:c.type==='line-break'?'\n':linkLabel(c);if(c.type==='url'||c.type==='link'||c.type==='reference')rawSpans.push({id:c.id,start,end:raw.length,link:c});}
 const normalizedOffset=(offset:number)=>raw.slice(0,offset).replace(/\r\n?/g,'\n').length;
 const spans=rawSpans.map(s=>({...s,start:normalizedOffset(s.start),end:normalizedOffset(s.end)}));
 const id=node.id,epsilon=1e-6,size=style.fontSize.value,lineHeight=style.lineHeightPt;
 const fontId=style.fontWeight==='bold'?(style.fontStyle==='italic'?'font-bold-italic':'font-bold'):(style.fontStyle==='italic'?'font-italic':'font-regular');
 if(available<=0)throw new LayoutError(id,'No content width');
  const cache=new Map<string,ShapedText>();
  const shape=async(text:string)=>{if(!cache.has(text))cache.set(text,await runtime.shape(text,fontId,size));return cache.get(text)!;};
  const extent=(s:ShapedText)=>Math.max(s.glyphs.reduce((a,g)=>a+g.advancePt,0),s.inkRightPt??0)-Math.min(0,s.inkLeftPt??0);
  const lines:MeasuredLine[]=[];
  const emit=async(text:string,sourceStart=0)=>{
   if(!text){lines.push({heightPt:lineHeight});return;}
   const shaped=await shape(text),advance=shaped.glyphs.reduce((a,g)=>a+g.advancePt,0);
   if(extent(shaped)>available+epsilon||shaped.ascentPt+shaped.descentPt>lineHeight+epsilon)throw new LayoutError(id,'Text ink does not fit the configured line');
   lines.push({heightPt:lineHeight,run:{nodeId:id,kind:'glyph-run',text,fontId,fontSizePt:size,lineHeightPt:lineHeight,baselineOffsetPt:shaped.ascentPt+(lineHeight-shaped.ascentPt-shaped.descentPt)/2,color:'000000',bounds:{xPt:-Math.min(0,shaped.inkLeftPt??0),yPt:0,widthPt:advance,heightPt:lineHeight},glyphs:shaped.glyphs,...(spans.length?{sourceStart,...(shaped.glyphInkBoundsPt?{glyphInkBoundsPt:shaped.glyphInkBoundsPt}:{}),links:spans.filter(s=>s.start<sourceStart+text.length&&s.end>sourceStart)}:{})}});
  };
  const text=raw.replace(/\r\n?/g,'\n');
  let paragraphStart=0;
  for(const paragraph of text.split('\n')){
   if(!paragraph){await emit('');paragraphStart++;continue;}
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
    await emit(paragraph.slice(start,end),paragraphStart+start);start=end;
   }
   paragraphStart+=paragraph.length+1;
  }
 return lines;
}
