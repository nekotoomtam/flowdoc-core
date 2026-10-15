import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
const template=()=>JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8'));
const request=()=>JSON.parse(readFileSync('fixtures/srs-basic/request.json','utf8'));
function run(req:any,t=template()){const v=validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));return prepareGeneration(v.value,req);}
it('prepares A/B/A and fills independent defaults without mutating input',()=>{
 const req=request(),before=structuredClone(req),r=run(req);expect(r.ok).toBe(true);if(!r.ok)return;
 expect(r.value.sections.main.data.details.entries.map(c=>c.originalIndex)).toEqual([0,1,2]);
 expect((r.value.sections.main.data.details.entries[1]!.data.items as any[])[0].remark).toBe('ไม่ระบุ');expect(req).toEqual(before);
});
it('reports all missing paths and unknown warnings together',()=>{
 const q=request();q.data={projectNmae:'x'};q.sections.main.data.details[0].data={};q.sections.main.data.details[1].data.items=[{}];const r=run(q);expect(r.ok).toBe(false);if(r.ok)return;
 expect(r.issues.map(i=>i.path)).toEqual(expect.arrayContaining(['data.projectName','sections.main.data.details[0].data.text','sections.main.data.details[1].data.items[0].code','sections.main.data.details[1].data.items[0].detail']));
 expect(r.warnings[0]).toMatchObject({code:'UNKNOWN_VARIABLE',path:'data.projectNmae',action:'ignored'});
});
it.each([null,123,false,[],{}])('rejects wrong string type %j without echo',value=>{
 const q=request();q.data.projectName=value;const r=run(q);expect(r.ok).toBe(false);if(!r.ok)expect(r.issues[0]).toMatchObject({code:'TYPE_MISMATCH',expectedType:'string',actualType:value===null?'null':Array.isArray(value)?'array':typeof value});
});
it('distinguishes missing containers from invalid containers and continues siblings',()=>{
 const q=request();delete q.data;q.sections.main.data.details[0].data=null;const r=run(q);expect(r.ok).toBe(false);if(r.ok)return;
 expect(r.issues.map(i=>i.path)).toEqual(['data.projectName','sections.main.data.details[0]']);
});
it('rejects unknown Area formats with indexed diagnostics rather than skipping them',()=>{
 const q=request();q.sections.main.data.details.unshift({format:'missing',data:{}});const r=run(q);expect(r.ok).toBe(false);if(!r.ok)expect(r.issues.some(i=>i.path==='sections.main.data.details[0].format')).toBe(true);
});
it.each(['docKey','version','envelope','missingEntryData','emptyFormat'])('rejects invalid request %s',kind=>{
 const q=request();if(kind==='docKey')q.docKey='other';else if(kind==='version')q.version=2;else if(kind==='envelope')q.extra=true;else if(kind==='missingEntryData')delete q.sections.main.data.details[0].data;else q.sections.main.data.details[0].format='';expect(run(q).ok).toBe(false);
});
it('presence beats default, supplied empty fails, absent optional becomes empty',()=>{
 const t=template();t.examples=[];t.globalSchema.fields={a:{type:'string',required:true,default:'d'},b:{type:'string',allowEmpty:false},c:{type:'string',default:'d'}};
 t.areaFormats['section-note'].fragment.nodes.note.children=[];
 const q=request();q.data={};expect(run(q,t).ok).toBe(false);q.data={a:''};const r=run(q,t);expect(r.ok&&r.value.data).toEqual({a:'',b:'',c:'d'});
 q.data.b=' ';expect(run(q,t).ok).toBe(false);q.data={a:'',c:null};expect(run(q,t).ok).toBe(false);
});
it('clones array defaults for repeated invocations and preserves special keys safely',()=>{
 const t=template();t.examples=[];const s=t.areaFormats['requirement-list'].inputSchema.fields.items;s.required=false;s.default=[{code:'D',detail:'Default'}];
 t.globalSchema.fields=JSON.parse('{"__proto__":{"type":"string"},"constructor":{"type":"string"},"projectName":{"type":"string"}}');
 const q=request();q.data=JSON.parse('{"__proto__":"safe","constructor":"own"}');q.sections.main.data.details=[{format:'requirement-list',data:{}},{format:'requirement-list',data:{}}];
 const r=run(q,t);expect(r.ok).toBe(true);if(!r.ok)return;
 expect(r.value.data.__proto__).toBe('safe');expect(r.value.data.constructor).toBe('own');
 (r.value.sections.main.data.details.entries[0]!.data.items as any[])[0].code='changed';expect((r.value.sections.main.data.details.entries[1]!.data.items as any[])[0].code).toBe('D');expect(s.default[0].code).toBe('D');
});
