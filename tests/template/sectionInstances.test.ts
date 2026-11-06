import {defaultUses} from '../helpers/sectionUses.js';
import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {sectionTemplate} from '../helpers/sections.js';
export const sid=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function instances():any {
 const t=sectionTemplate();t.nodeModelVersion=20;t.areaFormats={};t.globalSchema={type:'object',fields:{}};
 t.sections.forEach((s:any,i:number)=>{delete s.key;delete s.formats;s.id=sid(i+1);s.label='SRS'+(i+1);s.nameBase='SRS';s.inputSchema={type:'object',fields:{name:{type:'string',required:true}}};s.source={kind:'authored',repeats:[],fragment:{rootIds:['text'],nodes:{text:{id:'text',type:'text-block',props:{textStyleId:'body'},role:{role:'paragraph'},children:[{id:'value',type:'field-ref',scope:'section',key:'name'}]}}}};});return t;
}
const request=(t:any)=>({docKey:t.docKey,data:{},sections:[{sectionKey:'main',instanceKey:'beta',data:{name:'Beta'}},{sectionKey:'intro',instanceKey:'alpha',data:{name:'Alpha'}}]});
it('preserves caller instance order and keeps duplicate display labels independent',()=>{
 const t=instances();t.sections[1].label=t.sections[0].label;const v=validateTemplate(t);expect(v.ok,JSON.stringify(v)).toBe(true);if(!v.ok)return;
 const p=prepareGeneration(v.value,request(t));expect(p.ok,JSON.stringify(p)).toBe(true);if(!p.ok)return;
 expect(p.value.schemaVersion).toBe(3);expect((p.value.sections as any[]).map(s=>s.id)).toEqual([sid(2),sid(1)]);
 const d=composeDocument(v.value,p.value);expect(d.ok,JSON.stringify(d)).toBe(true);if(!d.ok)return;
 expect(d.value.sections!.map(s=>s.sectionId)).toEqual(['instance-beta','instance-alpha']);
 expect(d.value.rootIds.map(id=>(d.value.nodes[id] as any).children[0].text)).toEqual(['Beta','Alpha']);
 const forged=structuredClone(p.value);(forged as any).template.nodeModelVersion=18;expect(composeDocument(v.value,forged).ok).toBe(false);
});
it.each([
 ['duplicate',(r:any)=>r.sections.push(r.sections[0]),'SECTION_INSTANCE_DUPLICATE'],
 ['empty',(r:any)=>r.sections=[],'SECTION_ASSEMBLY_EMPTY'],
 ['unknown',(r:any)=>r.sections[0].sectionKey='unknown','SECTION_KEY_UNKNOWN'],
 ['map',(r:any)=>r.sections={},'SECTION_INPUT_SHAPE'],
 ['no instance',(r:any)=>delete r.sections[0].instanceKey,'SECTION_INSTANCE_REQUIRED'],
 ['unknown field',(r:any)=>r.sections[0].data.extra='x','INVALID_DATA'],
 ['no data',(r:any)=>delete r.sections[0].data,'INVALID_DATA'],
 ['absent band',(r:any)=>r.sections[0].header={},'INVALID_DATA'],
] as const)('rejects %s explicitly',(_,mutate,code)=>{const t=instances(),v=validateTemplate(t);expect(v.ok,JSON.stringify(v)).toBe(true);if(!v.ok)return;const r=request(t);mutate(r);const p=prepareGeneration(v.value,r);expect(p.ok).toBe(false);if(!p.ok)expect(p.issues.map(i=>i.code)).toContain(code);});
it('rejects non-UUID, duplicate IDs and legacy fields in model20',()=>{for(const change of [(t:any)=>t.sections[0].id='name',(t:any)=>t.sections[1].id=t.sections[0].id,(t:any)=>t.sections[0].key='name']){const t=instances();change(t);expect(validateTemplate(t).ok).toBe(false);}});
it('uses explicit instances and schema3 snapshots',()=>{const t=sectionTemplate(),v=validateTemplate(t);expect(v.ok).toBe(true);if(!v.ok)return;const p=prepareGeneration(v.value,{docKey:t.docKey,data:{projectName:'Legacy'},sections:defaultUses(t).map((u:any)=>u.sectionKey===(t.sections.length===1?t.sections[0]:t.sections.find((s:any)=>s.sectionKey==='main')).sectionKey?{...u,instanceKey:"main",data:{details:[]}}:u)});expect(p.ok,JSON.stringify(p)).toBe(true);if(p.ok){expect(p.value.schemaVersion).toBe(3);expect(Array.isArray(p.value.sections)).toBe(true);expect(composeDocument(v.value,p.value).ok).toBe(true);}});
it('namespaces identical local anchors and resolves explicit cross-Section references',()=>{
 const t=instances();for(const s of t.sections){const n=s.source.fragment.nodes.text;n.props.anchorId='intro';n.children.push({id:'ref',type:'reference',text:'Introduction',target:'intro'});}
 t.sections[1].source.fragment.nodes.text.children.push({id:'cross',type:'reference',text:'Other introduction',target:'intro',targetInstanceKey:'alpha'});
 const v=validateTemplate(t);expect(v.ok,JSON.stringify(v)).toBe(true);if(!v.ok)return;const p=prepareGeneration(v.value,request(t));expect(p.ok).toBe(true);if(!p.ok)return;const d=composeDocument(v.value,p.value);expect(d.ok,JSON.stringify(d)).toBe(true);if(!d.ok)return;
 const a:any=d.value.nodes[d.value.rootIds[0]!]!,b:any=d.value.nodes[d.value.rootIds[1]!]!;
 expect(a.props.anchorId).not.toBe(b.props.anchorId);expect(a.children[1].target).toBe(a.props.anchorId);expect(a.children[2].target).toBe(b.props.anchorId);
});
it('rejects non-JSON prepared input before invoking caller getters',()=>{
 const v=validateTemplate(instances());expect(v.ok).toBe(true);if(!v.ok)return;let called=0;
 const p:any={};Object.defineProperty(p,'schemaVersion',{enumerable:true,get(){called++;throw Error('caller getter');}});
 expect(()=>composeDocument(v.value,p)).not.toThrow();expect(called).toBe(0);expect(composeDocument(v.value,p).ok).toBe(false);
});
