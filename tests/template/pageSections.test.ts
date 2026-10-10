import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {validatePreparedInput} from '../../src/composition/validatePreparedInput.js';
import {sectionTemplate,sectionAreaTemplate,valid} from '../helpers/sections.js';
it('accepts default/explicit page layouts and authored global fields',()=>{valid();});
it('counts global Area placements across authored sections and content formats',()=>{
 const t=sectionAreaTemplate();valid(t);
 t.formats['section-note'].fragment.nodes.extra={id:'extra',type:'area',props:{areaId:'area-001'}};
 t.formats['section-note'].fragment.rootIds.push('extra');expect(validateTemplate(t).ok).toBe(false);
});
it('legacy empty content stays rejected and global defaults still apply',()=>{
 const t=JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8'));const old=validateTemplate(t);expect(old.ok).toBe(true);if(!old.ok)return;
 expect(prepareGeneration(old.value,{docKey:t.docKey,data:{projectName:'Demo'},content:[]}).ok).toBe(false);
 const n=sectionTemplate();n.globalSchema.fields.projectName={type:'string',default:'Default'};
 const r=prepareGeneration(valid(n),{docKey:n.docKey,data:{},content:[]});expect(r.ok&&r.value.data.projectName).toBe('Default');
});
it.each([
 ['duplicate section',(t:any)=>t.sections.push(structuredClone(t.sections[0]))],
 ['missing default',(t:any)=>t.book.defaultPageLayoutId='missing'],
 ['missing reference',(t:any)=>t.sections[0].pageLayoutId='missing'],
 ['invalid margins',(t:any)=>t.pageLayouts.normal.page.margin.left.value=500],
 ['second content',(t:any)=>t.sections.push({id:'another',source:{kind:'content'}})],
 ['local binding',(t:any)=>t.sections[0].source.fragment.nodes.title.children[0].scope='local'],
 ['unsupported cover',(t:any)=>t.sections[0].role='cover'],
 ['ambiguous book page',(t:any)=>t.book.page=t.pageLayouts.normal.page],
 ['no formats for content',(t:any)=>t.formats={}],
 ['legacy fields',(t:any)=>t.nodeModelVersion=11],
])('rejects %s',(_,mutate)=>{const t=sectionTemplate();mutate(t);expect(validateTemplate(t).ok).toBe(false);});
it('prepares authored-only content[] and rejects lost/tampered request indices',()=>{
 const t=sectionTemplate();t.sections.pop();t.formats={};const v=valid(t);
 const p=prepareGeneration(v,{docKey:t.docKey,data:{projectName:'Demo'},content:[]});expect(p.ok).toBe(true);if(!p.ok)return;
 expect(validatePreparedInput(v,p.value).ok).toBe(true);
 expect(validatePreparedInput(v,{...p.value,originalContentCount:1}).ok).toBe(false);
 expect(prepareGeneration(v,{docKey:t.docKey,data:{projectName:'Demo'},content:[{format:'x',data:{}}]}).ok).toBe(false);
 for(const content of [undefined,null,{}])expect(prepareGeneration(v,{docKey:t.docKey,data:{projectName:'Demo'},content}).ok).toBe(false);
 expect(prepareGeneration(v,{docKey:t.docKey,data:{},content:[]}).ok).toBe(false);
});
