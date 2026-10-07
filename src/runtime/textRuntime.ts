import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {ExportResources} from './exportResources.js';
import type {ShapedText,TextRuntime} from '../layout/textFlow.js';
const exec=promisify(execFile);
export const subprocessOptions={timeout:30_000,maxBuffer:16*1024*1024,windowsHide:true};
export function byteOffsets(text:string):Map<number,number>{
 if(!text.isWellFormed())throw Error('Malformed Unicode');
 const map=new Map<number,number>();let b=0,u=0;
 for(const ch of text){map.set(b,u);b+=Buffer.byteLength(ch);u+=ch.length;}map.set(b,u);return map;
}
export function decodeShape(raw:any,text:string,sizePt:number):ShapedText{
 const offsets=byteOffsets(text);
 if(!raw||raw.shaperRevision!=='rustybuzz-0.20.1'||!Number.isFinite(raw.unitsPerEm)||raw.unitsPerEm<=0||!Number.isFinite(raw.ascent)||!Number.isFinite(raw.descent)||!Array.isArray(raw.glyphs)||!raw.glyphs.length)throw Error('Invalid shape result');
 const scale=sizePt/raw.unitsPerEm;
 const starts:number[]=[...new Set<number>(raw.glyphs.map((g:any)=>g.cluster))].sort((a,b)=>a-b);
 if(starts[0]!==0||starts.some(n=>!offsets.has(n)||n===Buffer.byteLength(text)))throw Error('Invalid shape cluster');
 let cursor=0,left=0,right=0,top=raw.ascent*scale,bottom=-raw.descent*scale;
 const glyphs=raw.glyphs.map((g:any)=>{
  if(!Number.isInteger(g.glyphId)||g.glyphId<=0||g.glyphId>65535||![g.xAdvance,g.yAdvance,g.xOffset,g.yOffset].every(Number.isFinite)||g.yAdvance!==0||g.xAdvance<0)throw Error('Unsupported glyph metrics');
  if(g.ink!==null){
   if(!g.ink||![g.ink.xMin,g.ink.xMax,g.ink.yMin,g.ink.yMax].every(Number.isFinite))throw Error('Missing glyph ink');
   left=Math.min(left,cursor+(g.xOffset+g.ink.xMin)*scale);right=Math.max(right,cursor+(g.xOffset+g.ink.xMax)*scale);
   top=Math.max(top,(g.yOffset+g.ink.yMax)*scale);bottom=Math.max(bottom,-(g.yOffset+g.ink.yMin)*scale);
  }
  cursor+=g.xAdvance*scale;
  return {glyphId:g.glyphId,advancePt:g.xAdvance*scale,offsetXPt:g.xOffset*scale,offsetYPt:g.yOffset*scale,clusterStartOffset:offsets.get(g.cluster)!,clusterEndOffset:offsets.get(starts[starts.indexOf(g.cluster)+1]??Buffer.byteLength(text))!};
 });
 return {glyphs,ascentPt:top,descentPt:bottom,inkLeftPt:left,inkRightPt:right};
}
export function createTextRuntime(resources:ExportResources):TextRuntime{
 return {
  async breaks(text){
   const raw=JSON.parse((await exec(resources.segmenterPath,[text],subprocessOptions)).stdout);
   const map=byteOffsets(text);
   if(raw.segmenterRevision!=='icu_segmenter-2.2.0'||!Array.isArray(raw.breakByteOffsets)||raw.breakByteOffsets.some((b:unknown)=>typeof b!=='number'||!map.has(b)))throw Error('Invalid break offsets');
   return raw.breakByteOffsets.map((b:number)=>map.get(b)!);
  },
  async shape(text,fontId,sizePt){
   const font=resources.fonts.find(f=>f.id===fontId);if(!font)throw Error('Missing font');
   const raw=JSON.parse((await exec(resources.shaperPath,[font.path,text,fontId],subprocessOptions)).stdout);
   if(raw.text!==text||raw.fontId!==fontId)throw Error('Mismatched shape result');
   return decodeShape(raw,text,sizePt);
  }
 };
}
