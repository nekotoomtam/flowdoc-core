import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate,normalizeTaskInput,prepareGeneration,composeDocument} from '../../src/index.js';
import {areaCover,sectionId} from '../helpers/areaCover.js';
const api:any=await import('../../src/index.js');
const available={kind:'task-image',version:1,availability:'available',assetId:'20000000-0000-4000-8000-000000000001'};
function value(v:any):any{return {async byteLength(){return Buffer.byteLength(JSON.stringify(v));},async kind(){return Array.isArray(v)?'array':v!==null&&typeof v==='object'?'object':'scalar';},async scalar(){if(v&&typeof v==='object')throw Error('container read forbidden');return v;},async *properties(){for(const[k,x]of Object.entries(v))yield[k,value(x)];},async *elements(){for(const x of v)yield value(x);}};}
async function fixture(t:any,q:any,omitted=false){const v=validateTemplate(t);expect(v.ok,JSON.stringify(v)).toBe(true);if(!v.ok)throw Error();let text='';const n=await normalizeTaskInput(v.value,value(q),{write:async s=>{text+=s;},images:{collect:async()=>{},seal:async()=>{},resolve:async()=>omitted?{kind:'task-image',version:1,availability:'unavailable',reason:'IMAGE_SOURCE_MISSING',findingId:'30000000-0000-4000-8000-000000000001'}:available}});expect(n.ok,JSON.stringify(n)).toBe(true);return {v:v.value,n:JSON.parse(text)};}
it('exposes bounded normalized composition at the package root',()=>expect(api.composeTaskDocument).toBeTypeOf('function'));
it.each(['srs-basic','row-groups','page-bands','section-ownership','page-numbering','format-sizing'])('keeps compiled access and uncached validation/expansion identical including empty collections: %s',async name=>{
 const t=JSON.parse(readFileSync(`fixtures/${name}/template.json`,'utf8')),q=JSON.parse(readFileSync(`fixtures/${name}/request.json`,'utf8'));const {docKey,version,uploadId,...input}=q;
 const {v,n}=await fixture(t,input);expect(await api.composeTaskDocument(v,value(n),{templateAccess:false})).toEqual(await api.composeTaskDocument(v,value(n)));
 const bad=structuredClone(n);bad.template.fingerprint='changed';for(const templateAccess of [true,false])expect((await api.composeTaskDocument(v,value(bad),{templateAccess})).ok).toBe(false);
});
it('preserves empty Area branches and clone-specific changed bindings without stale cross-call plans',async()=>{
 const t=areaCover(),q={data:{},sections:[{id:sectionId,data:{parts:[]}}]},a=await fixture(t,q);
 expect(await api.composeTaskDocument(a.v,value(a.n))).toEqual(await api.composeTaskDocument(a.v,value(a.n),{templateAccess:false}));
 const clone=structuredClone(t);clone.areaFormats.panel.fragment.nodes.title.children=[{id:'changed',type:'text',text:'changed clone'}];const b=await fixture(clone,{data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{}}]}}]});
 expect(b.v.fingerprint).not.toBe(a.v.fingerprint);expect(await api.composeTaskDocument(b.v,value(b.n))).toEqual(await api.composeTaskDocument(b.v,value(b.n),{templateAccess:false}));expect((await api.composeTaskDocument(b.v,value(a.n))).ok).toBe(false);
});
it.each(['srs-basic','row-groups','page-bands','section-ownership','page-numbering','format-sizing'])('matches legacy graph including IDs/source maps/format metadata: %s',async name=>{
 const t=JSON.parse(readFileSync(`fixtures/${name}/template.json`,'utf8')),q=JSON.parse(readFileSync(`fixtures/${name}/request.json`,'utf8'));const {docKey,version,uploadId,...input}=q;const {v,n}=await fixture(t,input);
 const convert=(x:any):any=>x?.kind==='task-image'?x.assetId:Array.isArray(x)?x.map(convert):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,convert(v)])):x;
 const p=prepareGeneration(v,{docKey:t.docKey,data:convert(n.data),sections:convert(n.sections)});expect(p.ok,JSON.stringify(p)).toBe(true);if(!p.ok)throw Error();const expected=composeDocument(v,p.value);expect(expected.ok,JSON.stringify(expected)).toBe(true);
 expect(await api.composeTaskDocument(v,value(n))).toEqual(expected);
});
it('accepts canonical omitted optional link/string fields from normalization',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields={link:{type:'link'},text:{type:'string',allowEmpty:false}};
 const {v,n}=await fixture(t,{data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{}}]}}]});expect((await api.composeTaskDocument(v,value(n))).ok).toBe(true);
});
it('preserves model19 Section identity and unavailable frames without adding a second omission',async()=>{
 const t=areaCover();t.areaFormats.panel.inputSchema.fields.photo={type:'image',required:true};t.areaFormats.panel.fragment.rootIds.unshift('photo');t.areaFormats.panel.fragment.nodes.photo={id:'photo',type:'image',props:{width:{value:100,unit:'pt'},height:{value:50,unit:'pt'},source:{scope:'local',key:'photo'}}};
 const {v,n}=await fixture(t,{data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{}}]}}]},true);const r=await api.composeTaskDocument(v,value(n));expect(r.ok,JSON.stringify(r)).toBe(true);expect(r.warnings).toEqual([]);expect(Object.values(r.value.nodes).filter((x:any)=>x.type==='image')).toMatchObject([{props:{resourceId:'unavailable-30000000-0000-4000-8000-000000000001'}}]);
});
it('rejects a stale normalized template pin and malformed image markers',async()=>{
 const t=JSON.parse(readFileSync('fixtures/areas/template.json','utf8')),{v,n}=await fixture(t,{data:{},sections:{evidence:{data:{details:[{format:'evidence',data:{photo:{image:{upload:true}},caption:'A'}}]}},evidence2:{data:{details:[]}},merged:{data:{details:[]}}}});
 const stale=structuredClone(n);stale.template.fingerprint='0'.repeat(64);expect((await api.composeTaskDocument(v,value(stale))).ok).toBe(false);
 const bad=structuredClone(n);bad.sections.evidence.data.details[0].data.photo.assetId='bad';expect((await api.composeTaskDocument(v,value(bad))).ok).toBe(false);
});
function globalTable(){const t=areaCover();t.areaFormats={};t.globalSchema={type:'object',fields:{rows:{type:'array',items:{type:'object',fields:{name:{type:'string',required:true}}}}}};const s=t.sections[0];s.inputSchema={type:'object',fields:{}};s.source={kind:'authored',repeats:[{tableId:'table',rowTemplateId:'row',source:{scope:'global',key:'rows'}}],fragment:{rootIds:['table'],nodes:{table:{id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:200,unit:'pt'}}],rowIds:['row']},row:{id:'row',type:'table-row',props:{allowBreak:true},cellIds:['cell']},cell:{id:'cell',type:'table-cell',props:{},childIds:['text']},text:{id:'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'name',type:'field-ref',scope:'item',key:'name'}]}}}};return t;}
it('scopes optional record leases without changing repeated rows, clone order or source identities',async()=>{
 const t=globalTable(),s=structuredClone(t.sections[0]);s.id='10000000-0000-4000-8000-000000000002';s.label='Document2';t.sections.push(s);
 const {v,n}=await fixture(t,{data:{rows:[{name:'same'},{name:'same'},{name:'last'}]},sections:t.sections.map((s:any)=>({id:s.id,data:{}}))});let active=0,acquired=0,peak=0;
 const wrap=(raw:any,cached=false):any=>({...value(raw),async *properties(){for(const[k,x]of Object.entries(raw))yield[k,wrap(x,cached)];},async *elements(){for(const x of raw)yield wrap(x,cached);},async retainRecord(){if(cached)return {value:wrap(raw,true),release(){}};acquired++;peak=Math.max(peak,++active);let done=false;return {value:wrap(raw,true),release(){if(!done){done=true;active--;}}};}});
 const expected=await api.composeTaskDocument(v,value(n));expect(await api.composeTaskDocument(v,wrap(n))).toEqual(expected);expect(acquired).toBeGreaterThan(0);expect(peak).toBeLessThanOrEqual(2);expect(active).toBe(0);
});
it('releases suspended record leases when binding fails or cancellation interrupts a generator',async()=>{
 const t=globalTable(),{v,n}=await fixture(t,{data:{rows:[{name:'one'},{name:'two'}]},sections:[{id:sectionId,data:{}}]});
 for(const mode of ['error','abort']){let active=0,acquired=0;const abort=new AbortController(),reason=Error('cancel record');
 // Two validation walks each lease global data and the Section data (4 total).
 const wrap=(raw:any,cached=false):any=>({...value(raw),async scalar(){if(cached&&raw==='one'&&acquired>4){if(mode==='abort')abort.abort(reason);else throw Error('scalar IO');}return value(raw).scalar();},async *properties(){for(const[k,x]of Object.entries(raw))yield[k,wrap(x,cached)];},async *elements(){for(const x of raw)yield wrap(x,cached);},async retainRecord(){if(cached)return {value:wrap(raw,true),release(){}};acquired++;active++;let done=false;return {value:wrap(raw,true),release(){if(!done){done=true;active--;}}};}});
 const result=api.composeTaskDocument(v,wrap(n),{signal:abort.signal});if(mode==='abort')await expect(result).rejects.toBe(reason);else expect((await result).ok).toBe(false);expect(acquired).toBeGreaterThan(4);expect(active).toBe(0);}
});
it('replays a shared global collection for two cloned Sections with stable separate identities',async()=>{
 const t=globalTable(),s=structuredClone(t.sections[0]);s.id='10000000-0000-4000-8000-000000000002';s.label='Document2';t.sections.push(s);
 const q={data:{rows:Array.from({length:2000},(_,i)=>({name:'record'+i}))},sections:t.sections.map((s:any)=>({id:s.id,data:{}}))},{v,n}=await fixture(t,q);
 const p=prepareGeneration(v,{docKey:t.docKey,...q});expect(p.ok).toBe(true);const expected=composeDocument(v,(p as any).value),r=await api.composeTaskDocument(v,value(n));expect(r).toEqual(expected);expect(r.value.sections).toHaveLength(2);expect(new Set(Object.keys(r.value.nodes)).size).toBe(Object.keys(r.value.nodes).length);
});
it('rejects expanded task identities before exceeding 50,000 and respects cancellation',async()=>{
 const t=globalTable(),{v,n}=await fixture(t,{data:{rows:Array.from({length:13000},()=>({name:'x'}))},sections:[{id:sectionId,data:{}}]});
 expect(await api.composeTaskDocument(v,value(n))).toMatchObject({ok:false,issues:[{code:'EXPANSION_LIMIT'}]});const abort=new AbortController();abort.abort();await expect(api.composeTaskDocument(v,value(n),{signal:abort.signal})).rejects.toThrow();
},30000);

it('supports disk-style handles with prototype methods without materializing containers',async()=>{
 const t=areaCover(),{v,n}=await fixture(t,{data:{},sections:[{id:sectionId,data:{parts:[{format:'panel',data:{}}]}}]});
 class Handle{constructor(readonly raw:any){} async byteLength(){return Buffer.byteLength(JSON.stringify(this.raw));}async kind(){return Array.isArray(this.raw)?'array':this.raw&&typeof this.raw==='object'?'object':'scalar';}async scalar(){if(this.raw&&typeof this.raw==='object')throw Error('container forbidden');return this.raw;}async *properties(){for(const [k,x]of Object.entries(this.raw))yield [k,new Handle(x)];}async *elements(){for(const x of this.raw)yield new Handle(x);}}
 expect(await api.composeTaskDocument(v,new Handle(n))).toEqual(await api.composeTaskDocument(v,value(n)));
});
