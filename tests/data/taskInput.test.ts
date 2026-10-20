import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate,prepareGeneration} from '../../src/index.js';
import {areaCover,sectionId} from '../helpers/areaCover.js';
const api:any=await import('../../src/index.js');
export const value=(v:any):any=>({async byteLength(){return Buffer.byteLength(JSON.stringify(v));},async kind(){return Array.isArray(v)?'array':v!==null&&typeof v==='object'?'object':'scalar';},async scalar(){if(v!==null&&typeof v==='object')throw Error('Container materialization forbidden');return v;},async *properties(){for(const [k,x] of Object.entries(v))yield [k,value(x)];},async *elements(){for(const x of v)yield value(x);}});
const valid=(t:any)=>{const r=validateTemplate(t);if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
const available={kind:'task-image',version:1,availability:'available',assetId:'20000000-0000-4000-8000-000000000001'};
async function run(t:any,q:any,omit=false){let raw='',collected:any[]=[];const warnings:any[]=[];const r=await api.normalizeTaskInput(valid(t),value(q),{write:async(s:string)=>{raw+=s;},images:{collect:async(_v:any,c:any)=>{collected.push(c);},seal:async()=>{},resolve:async()=>omit?{kind:'task-image',version:1,availability:'unavailable',reason:'IMAGE_SOURCE_MISSING',findingId:'30000000-0000-4000-8000-000000000001'}:available},onWarning:async(w:any)=>{warnings.push(w);}});return {r,raw,collected,warnings};}
it('exports the storage-neutral bounded task reader',()=>expect(api.normalizeTaskInput).toBeTypeOf('function'));
it('normalizes model18 defaults/order and leaves the legacy object API unchanged',async()=>{
 const t=JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8')),old=JSON.parse(readFileSync('fixtures/srs-basic/request.json','utf8')),q={data:old.data,sections:old.sections};const before=structuredClone(q),{r,raw}=await run(t,q);expect(r.ok,JSON.stringify(r)).toBe(true);const n=JSON.parse(raw);expect(n.contract).toBe('flowdoc-task-input/1');expect(n.template.fingerprint).toBe(valid(t).fingerprint);expect(prepareGeneration(valid(t),{docKey:t.docKey,data:n.data,sections:n.sections})).toEqual(prepareGeneration(valid(t),old));expect(q).toEqual(before);
});
it('matches model19 IDs independently of property order and strips Section assets',async()=>{
 const t=areaCover(),q={sections:[{data:{parts:[{data:{},format:'panel'}]},assets:[{assetKey:'seal',image:{upload:true}}],id:sectionId}],data:{}};const {r,raw,collected}=await run(t,q);expect(r.ok,JSON.stringify(r)).toBe(true);const n=JSON.parse(raw);expect(n.sections[0]).toEqual({id:sectionId,data:{parts:[{format:'panel',data:{}}]}});expect(collected).toContainEqual({sectionId,pointer:'/sections/0/assets/0',assetDefinition:true});expect(prepareGeneration(valid(t),{docKey:t.docKey,data:n.data,sections:n.sections}).ok).toBe(true);
});
it('keeps a missing required typed image as explicit unavailable without losing surrounding values',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields={photo:{type:'image',required:true},caption:{type:'string',required:true}};const q={data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{caption:'BEFORE AFTER'}}]}}]};const {r,raw,collected}=await run(t,q,true);expect(r.ok,JSON.stringify(r)).toBe(true);expect(r.value.omittedPlacements).toBe(1);expect(JSON.parse(raw).sections[0].data.parts[0].data).toEqual({photo:{kind:'task-image',version:1,availability:'unavailable',reason:'IMAGE_SOURCE_MISSING',findingId:'30000000-0000-4000-8000-000000000001'},caption:'BEFORE AFTER'});expect(collected[0].pointer).toBe('/sections/0/data/parts/0/data/photo');expect(prepareGeneration(valid(t),{docKey:t.docKey,...q}).ok).toBe(false);
});
it('walks only typed image slots, with escaped Thai source pointers',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields={'รูป/~':{type:'image'},text:{type:'string'}};const {r,collected}=await run(t,{data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{'รูป/~':{image:{upload:true}},text:'{"assetKey":"business text"}'}}]}}]});expect(r.ok,JSON.stringify(r)).toBe(true);expect(collected).toEqual([{sectionId,pointer:'/sections/0/data/parts/0/data/รูป~1~0',assetDefinition:false}]);
});
it.each(['duplicate','missing','unknown','map'])('rejects invalid model19 Section identity: %s',async kind=>{
 const t=areaCover(),e={id:sectionId,data:{parts:[]}},q:any={data:{},sections:[e]};if(kind==='duplicate')q.sections.push(e);if(kind==='missing')q.sections=[];if(kind==='unknown')q.sections[0]={...e,id:'10000000-0000-4000-8000-000000000099'};if(kind==='map')q.sections={};expect((await run(t,q)).r.ok).toBe(false);
});
it('keeps strict model19 unknown-variable handling and model18 warnings',async()=>{
 const t=areaCover(),r=await run(t,{data:{unknown:'x'},sections:[{id:sectionId,data:{parts:[]}}]});expect(r.r.ok).toBe(false);
 const old=JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8')),q=JSON.parse(readFileSync('fixtures/srs-basic/request.json','utf8'));q.data.extra='ignored';delete q.docKey;delete q.version;const o=await run(old,q);expect(o.r.ok).toBe(true);expect(o.warnings.some(w=>w.code==='UNKNOWN_VARIABLE')).toBe(true);expect(JSON.parse(o.raw).data).not.toHaveProperty('extra');
});
it('does not materialize a large array of records in the reader',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields={rows:{type:'array',required:true,items:{type:'object',fields:{text:{type:'string',required:true}}}}};const row=value({text:'x'});let visited=0,writes=0;const large={async kind(){return 'array';},async *elements(){for(let i=0;i<10000;i++){visited++;yield row;}},async scalar(){throw Error('No full array read');}};const q=value({data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{rows:[]}}]}}]});const wrap=(v:any):any=>({...v,async *properties(){for await(const [k,x] of v.properties())yield [k,k==='rows'?large:wrap(x)];},async *elements(){for await(const x of v.elements())yield wrap(x);}});const r=await api.normalizeTaskInput(valid(t),wrap(q),{write:async()=>{writes++;},images:{collect:async()=>{},seal:async()=>{},resolve:async()=>available}});expect(r.ok,JSON.stringify(r)).toBe(true);expect(visited).toBe(20000);expect(writes).toBeGreaterThan(10000);
});
it('accepts valid link records up to the agreed scalar bounds without a private 4KiB ceiling',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields.link={type:'link',required:true};const link={type:'link',text:'x'.repeat(65536),url:'https://example.com/'+'a'.repeat(60000)},q={data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{link}}]}}]};expect(prepareGeneration(valid(t),{docKey:t.docKey,...q}).ok).toBe(true);const {r,raw}=await run(t,q);expect(r.ok,JSON.stringify(r)).toBe(true);expect(JSON.parse(raw).sections[0].data.parts[0].data.link).toEqual(link);
});
it('rejects the default aggregate logical-record count even when all members are small',async()=>{
 const t=JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8'));t.examples=[];t.globalSchema.fields.rows={type:'array',required:true,items:{type:'object',fields:{text:{type:'string'}}}};const {r}=await run(t,{data:{projectName:'A',rows:Array.from({length:100001},()=>({text:'x'}))},sections:{main:{data:{details:[]}}}});expect(r.ok).toBe(false);expect(r.issues[0].code).toBe('LIMIT_EXCEEDED');
},30000);
it('rejects a complete oversized parent Format record before collecting its nested members',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields.rows={type:'array',required:true,items:{type:'object',fields:{text:{type:'string'}}}};const {r,collected}=await run(t,{data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{rows:Array.from({length:5},()=>({text:'x'.repeat(60000)}))}}]}}]});expect(r.ok).toBe(false);expect(r.issues[0]).toMatchObject({code:'LIMIT_EXCEEDED',path:'/sections/0/data/parts/0'});expect(collected).toHaveLength(0);
});
it('enforces a separate image-placement limit before resolution/output',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields.rows={type:'array',required:true,items:{type:'object',fields:{photo:{type:'image'}}}};let raw='',collected=0;const r=await api.normalizeTaskInput(valid(t),value({data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{rows:[{}, {}, {}]}}]}}]}),{limits:{maxImagePlacements:2},write:async s=>{raw+=s;},images:{collect:async()=>{collected++;},seal:async()=>{},resolve:async()=>available}});expect(r.ok).toBe(false);expect(r.issues[0].code).toBe('LIMIT_EXCEEDED');expect(collected).toBe(2);expect(raw).toBe('');
});
