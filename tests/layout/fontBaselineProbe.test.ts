import {it,expect}from'vitest';
import {document,fakeRuntime}from'../helpers/document.js';
import {measureText}from'../../src/layout/measureText.js';
import {cacheTextRuntime}from'../../src/runtime/cacheTextRuntime.js';

it('changes only the baseline using the actual measured line height',async()=>{
 const d=document('กุ้ง ETA\nทดสอบ');const original=await measureText(d.nodes.t as any,d.styles.body!,100,fakeRuntime);
 const runtime:any={...fakeRuntime,spacingProbe:{baselineOffsetPt:(_id:string,_style:any,h:number,shape:any)=>Math.min(h-2.32,h-shape.descentPt)}};
 const measured=await measureText(d.nodes.t as any,d.styles.body!,100,runtime);
 expect(measured.map(l=>l.heightPt)).toEqual(original.map(l=>l.heightPt));
 expect(measured.map(l=>l.run?.text)).toEqual(original.map(l=>l.run?.text));
 expect(measured.map(l=>l.run?.baselineOffsetPt)).toEqual([15,15]);
 expect(measured.map(l=>l.run?.glyphs)).toEqual(original.map(l=>l.run?.glyphs));
});
it('preserves the baseline selection through the runtime cache and scopes it by node',async()=>{
 const d=document();const r:any=cacheTextRuntime({...fakeRuntime,spacingProbe:{baselineOffsetPt:(id:string)=>id==='t'?15:undefined}} as any);
 const selected=await measureText(d.nodes.t as any,d.styles.body!,100,r);
 const other=await measureText({...d.nodes.t,id:'other'} as any,d.styles.body!,100,r);
 expect(selected[0]!.run!.baselineOffsetPt).toBe(15);expect(other[0]!.run!.baselineOffsetPt).toBe(12.5);r.dispose();
});
it.each([NaN,-1,19])('rejects an invalid baseline without changing layout %s',async bad=>{
 const d=document();const r:any={...fakeRuntime,spacingProbe:{baselineOffsetPt:()=>bad}};
 await expect(measureText(d.nodes.t as any,d.styles.body!,100,r)).rejects.toThrow('baseline');
});
it('applies an experimental advance policy only to the requested node before wrapping',async()=>{
 const d=document('AB');const r:any={...fakeRuntime,spacingProbe:{shapedText:(id:string,_text:string,_font:string,_size:number,s:any)=>id==='t'?{...s,glyphs:s.glyphs.map((g:any)=>({...g,advancePt:4}))}:s}};
 expect((await measureText(d.nodes.t as any,d.styles.body!,8,r)).length).toBe(1);
 expect((await measureText({...d.nodes.t,id:'other'} as any,d.styles.body!,8,r)).length).toBe(2);
});
