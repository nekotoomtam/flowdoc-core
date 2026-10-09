import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
import {cellRepeatTemplate,cellRepeatRequest,photo} from '../helpers/cellRepeats.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
const images:any={[photo]:{format:'rgb',width:2,height:1,pixels:new Uint8Array(6)}};
it.each([false,true])('flows repeated images and long text over pages, merged=%s',merged=>{
 return (async()=>{
 const t=cellRepeatTemplate(),f=t.formats.merged,n=f.fragment.nodes;
 if(!merged){n.a.props={};n.table.columns=[{width:{value:420,unit:'pt'}}];n.table.rowIds=['header','r1'];n.h.props={};n.r1.cellIds=['a'];for(const id of ['r2','b','bt','c','ct','e','et'])delete n[id];}
 n.a.props.padding={top:{value:0,unit:'pt'},left:{value:0,unit:'pt'}};
 const v=ok(validateTemplate(t)),p=ok(prepareGeneration(v,cellRepeatRequest(Array.from({length:5},(_,i)=>({photo,caption:`BEGIN-${i}\n`+'ทดสอบข้อความยาว\n'.repeat(22)+`END-${i}`}))))),d=ok(composeDocument(v,p)),before=structuredClone(d);
 const r=await documentFlow(d,fakeRuntime,images);expect(r.pages.length).toBeGreaterThan(3);
 const placed=r.pages.flatMap(p=>p.images??[]);expect(placed).toHaveLength(5);expect(new Set(placed.map(i=>i.nodeId)).size).toBe(5);
 for(let i=0;i<5;i++)expect(placed[i]?.nodeId).toBe(`content-0~repeat-repeat-001~photo~item-${i}`);
 expect(r.pages[0]?.commands.some(c=>c.nodeId==='content-0~at')).toBe(true);expect(r.pages.at(-1)?.commands.some(c=>c.nodeId==='content-0~footer')).toBe(true);
 for(const page of r.pages)expect(page.commands.some(c=>c.nodeId==='content-0~ht')).toBe(true);
 expect(d).toEqual(before);
 })();
});
it('keeps empty array cell/static content and enforces oversize/allowBreak',async()=>{
 const t=cellRepeatTemplate(),v=ok(validateTemplate(t)),empty=ok(composeDocument(v,ok(prepareGeneration(v,cellRepeatRequest()))));
 expect((await documentFlow(empty,fakeRuntime)).pages.flatMap(p=>p.images??[])).toEqual([]);
 t.formats.merged.fragment.nodes.photo.props.height.value=2000;const large=ok(validateTemplate(t)),d=ok(composeDocument(large,ok(prepareGeneration(large,cellRepeatRequest([{photo}])))));await expect(documentFlow(d,fakeRuntime,images)).rejects.toThrow();
 const u=cellRepeatTemplate();u.formats.merged.fragment.nodes.r2.props.allowBreak=false;const uv=ok(validateTemplate(u)),ud=ok(composeDocument(uv,ok(prepareGeneration(uv,cellRepeatRequest(Array.from({length:20},()=>({photo})))))));await expect(documentFlow(ud,fakeRuntime,images)).rejects.toThrow();
});
