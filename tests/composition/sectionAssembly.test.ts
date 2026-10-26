import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration,composeDocument,normalizeTaskInput,composeTaskDocument} from '../../src/index.js';
import {assemblyTemplate,assemblyRequest} from '../helpers/assembly.js';
import {areaCover} from '../helpers/areaCover.js';
const take=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
const value=(v:any):any=>({async kind(){return Array.isArray(v)?'array':v&&typeof v==='object'?'object':'scalar'},async scalar(){return v},async byteLength(){return Buffer.byteLength(JSON.stringify(v))},async *properties(){for(const[k,x]of Object.entries(v))yield[k,value(x)]},async *elements(){for(const x of v)yield value(x)}});
it('composes A/B/A in request order with separate identity and immutable definitions',()=>{
 const t=assemblyTemplate(),before=JSON.stringify(t),v=take(validateTemplate(t)),q=assemblyRequest(t),p=take(prepareGeneration(v,q));
 expect(p.schemaVersion).toBe(3);expect(p.template.nodeModelVersion).toBe(20);
 const d=take(composeDocument(v,p));expect(d.sections.map((s:any)=>s.instanceKey)).toEqual(['first','middle','last']);
 expect(d.sections.map((s:any)=>s.definitionId)).toEqual([t.sections[0].id,t.sections[1].id,t.sections[0].id]);
 expect(d.rootIds.map((id:string)=>d.nodes[id].children[0].text)).toEqual(['Alpha','Beta','Gamma']);
 expect(new Set(d.sections.map((s:any)=>s.sectionId)).size).toBe(3);
 for(const id of d.rootIds)expect(d.nodes[id].children[1].target).toBe(d.nodes[id].props.anchorId);
 expect(JSON.stringify(t)).toBe(before);
 const subset=assemblyRequest(t);subset.sections=[subset.sections[1]];expect(take(composeDocument(v,take(prepareGeneration(v,subset)))).sections).toHaveLength(1);
});
it.each([
 ['duplicate use',(q:any)=>q.sections[2].instanceKey='first','SECTION_INSTANCE_DUPLICATE'],
 ['unknown definition',(q:any)=>q.sections[0].sectionKey='Missing','SECTION_KEY_UNKNOWN'],
 ['label lookup',(q:any)=>q.sections[0].sectionKey='Same label','SECTION_KEY_UNKNOWN'],
 ['no instance',(q:any)=>delete q.sections[0].instanceKey,'SECTION_INSTANCE_REQUIRED'],
 ['empty assembly',(q:any)=>q.sections=[],'SECTION_ASSEMBLY_EMPTY'],
 ['map shape',(q:any)=>q.sections={},'SECTION_INPUT_SHAPE'],
 ['undeclared data',(q:any)=>q.sections[0].data.extra='wrong','INVALID_DATA'],
 ['wrong band',(q:any)=>q.sections[0].header={},'INVALID_DATA']
])('rejects %s',(name,mutate,code)=>{const t=assemblyTemplate(),v=take(validateTemplate(t)),q=assemblyRequest(t);mutate(q);const r=prepareGeneration(v,q);expect(r.ok).toBe(false);if(!r.ok)expect(r.issues.map(i=>i.code)).toContain(code);});
it('requires unique public keys, accepts duplicate labels and rejects old fields',()=>{
 for(const change of [(t:any)=>t.sections[1].sectionKey='A',(t:any)=>delete t.sections[0].sectionKey,(t:any)=>t.sections[0].key='legacy']){const t=assemblyTemplate();change(t);expect(validateTemplate(t).ok).toBe(false)}
 expect(validateTemplate(assemblyTemplate()).ok).toBe(true);
});
it('rejects forged prepared identities and retains explicit cross-use addressing',()=>{
 const t=assemblyTemplate();t.sections[0].source.fragment.nodes.text.children.push({id:'other',type:'reference',text:'Other',target:'local',targetInstanceKey:'middle'});
 const v=take(validateTemplate(t)),p=take(prepareGeneration(v,assemblyRequest(t))),d=take(composeDocument(v,p));
 expect(d.nodes[d.rootIds[0]].children[2].target).toBe(d.nodes[d.rootIds[1]].props.anchorId);
 for(const change of [(p:any)=>p.template.fingerprint='forged',(p:any)=>p.sections[0].id=t.sections[1].id,(p:any)=>p.sections[2].instanceKey='first']){const x=structuredClone(p);change(x);expect(composeDocument(v,x).ok).toBe(false)}
 const missing=assemblyRequest(t);missing.sections=[missing.sections[0]];expect(composeDocument(v,take(prepareGeneration(v,missing))).ok).toBe(false);
});
it('normalizes bounded task input and composes the same ordered document',async()=>{
 const t=assemblyTemplate(),v=take(validateTemplate(t)),q=assemblyRequest(t),{docKey,version,...raw}=q;let text='';
 take(await normalizeTaskInput(v,value(raw),{write:async c=>{text+=c},images:{collect:async()=>{},seal:async()=>{},resolve:async()=>{throw Error('no image')}}}));
 const n=JSON.parse(text);expect(n.contract).toBe('flowdoc-task-input/2');expect(n.sections.map((s:any)=>s.instanceKey)).toEqual(['first','middle','last']);
 expect(await composeTaskDocument(v,value(n))).toEqual(composeDocument(v,take(prepareGeneration(v,q))));
});
it('keeps Area/ending-Area identity and independently bound page bands for repeated uses',()=>{
 const t=areaCover();t.nodeModelVersion=20;t.sections[0].sectionKey='A';
 const s=t.sections[0];s.source.fragment.nodes.parts.props.verticalAlign='bottom';
 for(const band of ['header','footer'])s[band]={baseTextStyleId:'body',inputSchema:{type:'object',fields:{name:{type:'string',required:true}}},fragment:{rootIds:['band'],nodes:{band:{id:'band',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'name',type:'field-ref',scope:band,key:'name'}]}}}};
 const q={docKey:t.docKey,data:{},sections:['first','last'].map(instanceKey=>({sectionKey:'A',instanceKey,data:{parts:[{format:'panel',data:{}}]},header:{name:instanceKey+' head'},footer:{name:instanceKey+' foot'}}))};
 const v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,q))));
 for(const [i,use]of d.sections.entries()){
  expect(use.endingArea.rootIds.length).toBe(2);expect(d.sourceMap[use.endingArea.rootIds[0]].sectionId).toBe(use.sectionId);
  expect(Object.values(use.header.nodes).find((n:any)=>n.type==='text-block').children[0].text).toBe(q.sections[i].header.name);
  expect(Object.values(use.footer.nodes).find((n:any)=>n.type==='text-block').children[0].text).toBe(q.sections[i].footer.name);
 }
});
it('rejects null containers instead of defaulting explicitly supplied values',()=>{
 const t=assemblyTemplate(),v=take(validateTemplate(t));for(const mutate of [(q:any)=>q.data=null,(q:any)=>q.sections[0].data=null]){const q=assemblyRequest(t);mutate(q);expect(prepareGeneration(v,q).ok).toBe(false)}
});
it('charges use counts and separates same-key images by runtime use in bounded normalization',async()=>{
 const t=assemblyTemplate();t.sections=t.sections.slice(0,1);t.sections[0].inputSchema.fields.logo={type:'image'};
 const v=take(validateTemplate(t)),q=assemblyRequest(t);q.sections=q.sections.filter(s=>s.sectionKey==='A');
 const contexts:any[]=[];let text='';const raw={data:q.data,sections:q.sections.map(s=>({...s,data:{...s.data,logo:{key:'same',source:{type:'part'}}}}))};
 take(await normalizeTaskInput(v,value(raw),{write:async c=>{text+=c},images:{collect:async(v,c)=>{contexts.push(c)},seal:async()=>{},resolve:async()=>({kind:'task-image',version:1,availability:'available',assetId:'40000000-0000-4000-8000-000000000001'})}}));
 expect(new Set(contexts.map(c=>c.sectionId)).size).toBe(2);expect(contexts.map(c=>c.pointer)).toEqual(['/sections/0/data/logo','/sections/1/data/logo']);
 const oversized=assemblyRequest(t);oversized.sections=Array.from({length:2001},(_,i)=>({sectionKey:'A',instanceKey:'use'+i,data:{name:'x'}}));expect(prepareGeneration(v,oversized).ok).toBe(false);
});
it.each([{mode:'auto'},{mode:'fixed',height:{value:240,unit:'pt'}}])('retains Area Format sizing independently in repeated uses: %j',async sizing=>{
 const t=areaCover();t.nodeModelVersion=20;t.sections[0].sectionKey='A';t.areaFormats.panel.sizing=sizing;
 const q={docKey:t.docKey,data:{},sections:['first','last'].map(instanceKey=>({sectionKey:'A',instanceKey,data:{parts:[{format:'panel',data:{}}]}}))};
 const v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,q))));
 expect(d.formatInstances.map((f:any)=>f.sectionId)).toEqual(['instance-first','instance-last']);
 expect(d.formatInstances.every((f:any)=>JSON.stringify(f.sizing)===JSON.stringify(sizing))).toBe(true);
 let normalized='';take(await normalizeTaskInput(v,value({data:q.data,sections:q.sections}),{write:async c=>{normalized+=c},images:{collect:async()=>{},seal:async()=>{},resolve:async()=>{throw Error('no image')}}}));
 expect(await composeTaskDocument(v,value(JSON.parse(normalized)))).toEqual({ok:true,value:d,warnings:[]});
});
it('keeps Section TOCs use-local and rejects a duplicated document TOC after expansion',()=>{
 const t=assemblyTemplate();
 for(const s of t.sections){s.source.fragment.nodes.text.props.toc={level:1};s.source.fragment.rootIds.unshift('toc');s.source.fragment.nodes.toc={id:'toc',type:'table-of-contents',props:{textStyleId:'body',scope:{kind:s.sectionKey==='A'?'section':'document'}}};}
 const v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,assemblyRequest(t)))));
 expect(Object.values(d.nodes).filter((n:any)=>n.type==='table-of-contents')).toHaveLength(3);
 t.sections[0].source.fragment.nodes.toc.props.scope.kind='document';delete t.sections[1].source.fragment.nodes.toc;t.sections[1].source.fragment.rootIds=t.sections[1].source.fragment.rootIds.filter((s:string)=>s!=='toc');
 const x=take(validateTemplate(t));expect(composeDocument(x,take(prepareGeneration(x,assemblyRequest(t)))).ok).toBe(false);
});
