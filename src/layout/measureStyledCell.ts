import {measureText,type MeasuredLine} from './measureText.js';
import type {ResolvedDocument,TextBlock} from '../composition/resolvedDocument.js';
import {LayoutError,type TextRuntime} from './textFlow.js';

// Trial scope: body table cells containing static text and string fields.
export async function measureStyledCell(node:TextBlock,styles:ResolvedDocument['styles'],width:number,runtime:TextRuntime):Promise<MeasuredLine[]> {
 const base=node.props.textStyleId;
 const spans:{start:number;end:number;style:string}[]=[];
 let text='';
 for(const child of node.children){
  if(child.type==='line-break'){text+='\n';continue;}
  if(child.type!=='text')throw new LayoutError(node.id,'Unsupported inline in styled cell');
  const start=text.length;
  text+=child.text.replace(/\r\n?/g,'\n').replace(/\t/g,' ');
  const style=child.textStyleId??base;
  const last=spans.at(-1);
  if(last?.style===style && last.end===start)last.end=text.length;
  else spans.push({start,end:text.length,style});
 }
 const cache=new Map<string,MeasuredLine>();
 async function line(start:number,end:number):Promise<MeasuredLine>{
  let advance=0,left=0,right=0,above=0,below=0;
  const runs:NonNullable<MeasuredLine['runs']>=[];
  for(const span of spans){
   const a=Math.max(span.start,start),b=Math.min(span.end,end);
   if(a>=b)continue;
   const key=JSON.stringify([span.style,a,b]);
   let piece=cache.get(key);
   if(!piece){
    const part={...node,children:[{id:node.id,type:'text' as const,text:text.slice(a,b)}]};
    [piece]=await measureText(part,styles[span.style]!,1e8,runtime);
    cache.set(key,piece!);
   }
   const run=piece!.run!;
   const shift=run.bounds.xPt;
   left=Math.min(left,advance-shift);
   right=Math.max(right,advance-shift+piece!.occupiedWidthPt!);
   runs.push({...run,bounds:{...run.bounds,xPt:advance}});
   advance+=run.bounds.widthPt;
   const baseline=run.baselineOffsetPt!;
   above=Math.max(above,baseline);
   below=Math.max(below,piece!.heightPt-baseline);
  }
  const heightPt=runs.length?above+below:styles[base]!.lineHeightPt;
  for(const run of runs){
   run.bounds.xPt-=left;run.bounds.heightPt=heightPt;run.lineHeightPt=heightPt;run.baselineOffsetPt=above;
  }
  return {runs,heightPt,occupiedWidthPt:right-left};
 }
 const result:MeasuredLine[]=[];
 let offset=0;
 for(const paragraph of text.split('\n')){
  if(!paragraph)result.push(await line(offset,offset));
  const breaks=[...new Set([...(await runtime.breaks(paragraph)),paragraph.length])].sort((a,b)=>a-b);
  let pos=0;
  while(pos<paragraph.length){
   let chosen=pos;
   for(const boundary of breaks){
    if(boundary<=pos)continue;
    if((await line(offset+pos,offset+boundary)).occupiedWidthPt!>width+1e-6)break;
    chosen=boundary;
   }
   if(chosen===pos){
    for(const g of new Intl.Segmenter('th',{granularity:'grapheme'}).segment(paragraph.slice(pos))){
     const boundary=pos+g.index+g.segment.length;
     if((await line(offset+pos,offset+boundary)).occupiedWidthPt!>width+1e-6)break;
     chosen=boundary;
    }
   }
   if(chosen===pos)throw new LayoutError(node.id,'A whole grapheme cannot fit the content width');
   result.push(await line(offset+pos,offset+chosen));
   pos=chosen;
  }
  offset+=paragraph.length+1;
 }
 return result;
}
