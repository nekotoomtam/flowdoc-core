import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
function setup(){const t=JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8')),q=structuredClone(t.examples[0].request),r=validateTemplate(t);if(!r.ok)throw Error('fixture');return {t:r.value,q};}
it.each(['content','items'])('rejects sparse %s arrays with compensating named properties',kind=>{
 const {t,q}=setup();const arr=kind==='content'?q.content:q.content[1].data.items;
 if(kind==='content')delete arr[1];else arr.length=2;arr.extra='not a JSON array member';
 expect(prepareGeneration(t,q).ok).toBe(false);
});
it('does not throw on deep unknown JSON; persisted unknown fields still fail',()=>{
 const {t,q}=setup();let deep:any={};for(let i=0;i<6000;i++)deep={child:deep};
 const p=prepareGeneration(t,q);if(!p.ok)throw Error('fixture');
 q.data.unknown=deep;expect(()=>prepareGeneration(t,q)).not.toThrow();const r=prepareGeneration(t,q);expect(r.ok).toBe(true);expect(r.warnings[0]?.code).toBe('UNKNOWN_VARIABLE');
 (p.value.data as any).unknown=deep;expect(()=>composeDocument(t,p.value)).not.toThrow();expect(composeDocument(t,p.value).ok).toBe(false);
});
it('rejects cycles and accessors without executing getters',()=>{
 const {t,q}=setup();q.data.cycle=q;expect(prepareGeneration(t,q).ok).toBe(false);delete q.data.cycle;
 let read=false;Object.defineProperty(q.data,'secret',{enumerable:true,get(){read=true;return 'secret';}});expect(prepareGeneration(t,q).ok).toBe(false);expect(read).toBe(false);
});
