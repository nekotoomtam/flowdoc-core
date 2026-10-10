import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
const photo='22222222-2222-4222-8222-222222222222';
it.each(['evidence','merged'])('flows area content in %s without placeholders',async format=>{
 const t=ok(validateTemplate(JSON.parse(readFileSync('fixtures/areas/template.json','utf8')))),items=Array.from({length:4},(_,i)=>({format:'evidence',data:{photo,caption:'BEGIN-'+i+'\n'+'ข้อความทดสอบ\n'.repeat(25)+'END-'+i}}));
 const p=ok(prepareGeneration(t,{docKey:'area-demo',data:{},content:[{format,data:{details:[{format:'notice',data:{}},...items]}}]})),d=ok(composeDocument(t,p)),before=structuredClone(d);
 const r=await documentFlow(d,fakeRuntime,{[photo]:{format:'rgb',width:2,height:1,pixels:new Uint8Array(6)}} as any);
 expect(r.pages.length).toBeGreaterThan(2);const images=r.pages.flatMap(p=>p.images??[]);expect(images).toHaveLength(4);expect(new Set(images.map(n=>n.nodeId)).size).toBe(4);expect(Object.values(d.nodes).some((n:any)=>n.type==='area')).toBe(false);expect(d).toEqual(before);
});
