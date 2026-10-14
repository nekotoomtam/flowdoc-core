import {it,expect} from 'vitest';
import {measureText} from '../../src/layout/measureText.js';
import {textFlow} from '../../src/layout/textFlow.js';
import {document,fakeRuntime} from '../helpers/document.js';
const text='จัดเก็บเอกสารทัั้งหมดเข้าที่จัดเก็บเอกสาร';
const runtime={...fakeRuntime,async shape(s:string){return {...await fakeRuntime.shape(s),ascentPt:s.includes('ัั')?18.744:14.616,descentPt:2.784};}};
it('expands only lines with tall ink without changing Thai marks or style',async()=>{
 const d=document(text+'\nnormal');d.styles.body!.lineHeightPt=20;
 const lines=await measureText(d.nodes.t!,d.styles.body!,480,runtime);
 expect(lines.map(l=>l.heightPt)).toEqual([21.528,20]);expect(lines[0]!.run!.text).toBe(text);
 expect(lines[0]!.run!.bounds.heightPt).toBe(21.528);expect(lines[0]!.run!.baselineOffsetPt).toBe(18.744);expect(d.styles.body!.lineHeightPt).toBe(20);
});
it('paginates using expanded heights without overlap and still rejects ink taller than a page',async()=>{
 const d=document(Array(60).fill(text).join('\n'));d.styles.body!.lineHeightPt=20;const draw=await textFlow(d,runtime);
 expect(draw.pages.length).toBeGreaterThan(1);expect(draw.pages.flatMap(p=>p.commands).map(r=>r.text)).toEqual(Array(60).fill(text));
 for(const p of draw.pages){for(let i=0;i<p.commands.length;i++){const r=p.commands[i]!;expect(r.bounds.yPt+r.bounds.heightPt).toBeLessThanOrEqual(p.heightPt-20*72/25.4+1e-6);if(i)expect(r.bounds.yPt).toBeGreaterThanOrEqual(p.commands[i-1]!.bounds.yPt+p.commands[i-1]!.bounds.heightPt-1e-6);}}
 await expect(textFlow(document(text),{...runtime,async shape(s:string){return {...await runtime.shape(s),ascentPt:1000};}})).rejects.toThrow();
});
