import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate} from '../../src/template/validateTemplate.js';
export const fixture=()=>JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8'));
it('registers a detached frozen R1 template and stable fingerprint',()=>{
 const t=fixture(),r=validateTemplate(t);expect(r.ok).toBe(true);if(!r.ok)return;
 expect(Object.isFrozen(r.value.definition.formats)).toBe(true);
 t.name='changed';expect(r.value.definition.name).toBe('SRS MVP');
 const other=validateTemplate(Object.fromEntries(Object.entries(fixture()).reverse()));
 expect(other.ok&&other.value.fingerprint).toBe(r.value.fingerprint);
});
it.each([
 ['unsupported type',(t:any)=>t.globalSchema.fields.projectName.type='number'],
 ['bad default',(t:any)=>t.globalSchema.fields.projectName.default=' '],
 ['bad style',(t:any)=>t.formats['section-note'].fragment.nodes.note.props.textStyleId='missing'],
 ['unknown tag',(t:any)=>t.formats['section-note'].fragment.nodes.note.children[1].key='missing'],
 ['item outside row',(t:any)=>t.formats['section-note'].fragment.nodes.note.children[1].scope='item'],
 ['duplicate inline',(t:any)=>t.formats['section-note'].fragment.nodes.note.children[0].id='note'],
 ['missing ref',(t:any)=>t.formats['requirement-list'].fragment.nodes.table.rowIds.push('absent')],
 ['shared parent',(t:any)=>t.formats['requirement-list'].fragment.nodes.hc.childIds.push('htd')],
 ['orphan',(t:any)=>t.formats['section-note'].fragment.rootIds=[]],
 ['cycle',(t:any)=>t.formats['requirement-list'].fragment.nodes.rc.childIds=['table']],
 ['unequal columns',(t:any)=>t.formats['requirement-list'].fragment.nodes.table.columns.pop()],
 ['header repeat',(t:any)=>t.formats['requirement-list'].repeats[0].rowTemplateId='header'],
 ['duplicate repeat',(t:any)=>t.formats['requirement-list'].repeats.push(t.formats['requirement-list'].repeats[0])],
 ['nested format',(t:any)=>t.formats['section-note'].fragment.nodes.note.type='invocation'],
 ['array text',(t:any)=>{const f=t.formats['requirement-list'];f.fragment.nodes.rtc.children[0]={id:'code',type:'field-ref',scope:'local',key:'items'};}],
 ['warning example',(t:any)=>t.examples[0].request.data.extra='bad'],
 ['example version',(t:any)=>t.examples[0].request.version=2],
 ['reserved id separator',(t:any)=>t.formats['section-note'].fragment.nodes.note.children[0].id='x~y'],
 ['nested array',(t:any)=>t.formats['requirement-list'].inputSchema.fields.items.items.fields.code={type:'array',items:{type:'object',fields:{}}}],
])('rejects %s',(_name,mutate)=>{const t=fixture();mutate(t);expect(validateTemplate(t).ok).toBe(false);});
