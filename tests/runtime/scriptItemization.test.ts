import {it,expect} from 'vitest';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createTextRuntime,decodeShape} from '../../src/runtime/textRuntime.js';

const native=it.runIf(process.platform==='linux');
const bin=resolve('runtime/linux-x64/flowdoc-rustybuzz-smoke');
const fonts=['assets/fonts/Sarabun-Regular.ttf','assets/fonts/Sarabun-Bold.ttf','assets/fonts/Sarabun-Italic.ttf','assets/fonts/Sarabun-BoldItalic.ttf','tests/docx/fixtures/BaiJamjuree/BaiJamjuree-Regular.ttf'];
native.each(fonts)('keeps Thai shaping independent of Latin prefix, with original UTF-16 cluster ownership: %s',async fontPath=>{
 const runtime=createTextRuntime({shaperPath:bin,fonts:[{id:'face',path:resolve(fontPath)}]} as any);
 try{
  for(const size of [10,12,16])for(const target of ['ที่','ลี่','น้ำ','ก๊ำ']){
   const standalone=await runtime.shape(target,'face',size);
   for(const prefix of ['A ','Rev.2 ','(Á) 123 ']){
    const mixed=await runtime.shape(prefix+target,'face',size);
    const suffix=mixed.glyphs.filter(g=>g.clusterStartOffset>=prefix.length).map(g=>({...g,clusterStartOffset:g.clusterStartOffset-prefix.length,clusterEndOffset:g.clusterEndOffset-prefix.length}));
    expect(suffix).toEqual(standalone.glyphs);
    expect(mixed.glyphs.every(g=>g.clusterStartOffset>=0&&g.clusterEndOffset<=prefix.length+target.length)).toBe(true);
   }
  }
 }finally{await runtime.close();}
});
native('preserves unsplit Latin and outside-profile shaping, including surrogate offsets',async()=>{
 const font=resolve(fonts[0]!);const runtime=createTextRuntime({shaperPath:bin,fonts:[{id:'face',path:font}]} as any);
 try{for(const text of ['AV ffi Á 12','ภาษาไทย','ก 😀 A']){
  // Outside-profile emoji preserves the existing native behavior, including missing-glyph failure.
  const raw=JSON.parse(execFileSync(bin,[font,text,'face'],{encoding:'utf8'}));
  if(raw.glyphs.some((g:any)=>g.glyphId===0))await expect(runtime.shape(text,'face',12)).rejects.toThrow();
  else expect(await runtime.shape(text,'face',12)).toEqual(decodeShape(raw,text,12));
 }}finally{await runtime.close();}
});
native('combines advances, positioned ink and clusters in the original coordinate system',async()=>{
 const font=resolve(fonts[0]!);const runtime=createTextRuntime({shaperPath:bin,fonts:[{id:'face',path:font}]} as any);
 try{
  const parts=['(Á) ','น้ำ ','AV'],shapes=[];
  for(const text of parts)shapes.push(decodeShape(JSON.parse(execFileSync(bin,[font,text,'face'],{encoding:'utf8'})),text,16));
  const result=await runtime.shape(parts.join(''),'face',16);
  let cursor=0,offset=0,left=0,right=0;const glyphs=[],ink=[];
  for(let i=0;i<parts.length;i++){
   const s=shapes[i]!;left=Math.min(left,cursor+s.inkLeftPt!);right=Math.max(right,cursor+s.inkRightPt!);
   glyphs.push(...s.glyphs.map(g=>({...g,clusterStartOffset:g.clusterStartOffset+offset,clusterEndOffset:g.clusterEndOffset+offset})));
   ink.push(...s.glyphInkBoundsPt!);cursor+=s.glyphs.reduce((a,g)=>a+g.advancePt,0);offset+=parts[i]!.length;
  }
  expect(result.glyphs).toEqual(glyphs);expect(result.glyphInkBoundsPt).toEqual(ink);
  expect(result.inkLeftPt).toBeCloseTo(left,10);expect(result.inkRightPt).toBeCloseTo(right,10);
  expect(result.ascentPt).toBe(Math.max(...shapes.map(s=>s.ascentPt)));
  expect(result.descentPt).toBe(Math.max(...shapes.map(s=>s.descentPt)));
 }finally{await runtime.close();await runtime.close();}
 await expect(runtime.shape('A ที่','face',16)).rejects.toThrow(/closed/);
});
native('aborting a mixed-script runtime closes owned sessions and rejects reuse',async()=>{
 const controller=new AbortController(),runtime=createTextRuntime({shaperPath:bin,fonts:[{id:'face',path:resolve(fonts[0]!)}]} as any,controller.signal);
 await runtime.shape('A ที่','face',12);controller.abort();
 await expect(runtime.shape('A น้ำ','face',12)).rejects.toThrow();await runtime.close();
});
