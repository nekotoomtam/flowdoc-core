import {expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {areaTemplate} from './areas.js';
export function sectionAreaTemplate():any {
 const t=sectionTemplate(),a=areaTemplate();
 t.globalSchema.fields.details={type:'area',areaId:'area-001'};
 Object.assign(t.areaFormats,a.areaFormats);
 t.sections.push({id:'10000000-0000-4000-8000-000000000003',sectionKey:'appendix',label:'Appendix',nameBase:'Appendix',inputSchema:{type:'object',fields:{}},source:{kind:'authored',repeats:[],fragment:{rootIds:['placement'],nodes:{placement:{id:'placement',type:'area',props:{areaId:'area-001'}}}}}});
 return t;
}
export function sectionTemplate():any {
 const t=JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8'));
 t.nodeModelVersion=20;t.examples=[];
 t.pageLayouts={normal:{page:t.pageLayouts.normal.page},wide:{page:{...structuredClone(t.pageLayouts.normal.page),orientation:'landscape'}}};
 t.book={contentSlot:'body',defaultPageLayoutId:'normal'};
 t.sections=[{id:'10000000-0000-4000-8000-000000000001',sectionKey:'intro',label:'Intro',nameBase:'Intro',inputSchema:{type:'object',fields:{}},source:{kind:'authored',repeats:[],fragment:{rootIds:['title'],nodes:{title:{id:'title',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'name',type:'field-ref',scope:'global',key:'projectName'}]}}}}},{...t.sections[0],id:'10000000-0000-4000-8000-000000000002',sectionKey:'main',label:'Main',nameBase:'Main',pageLayoutId:'wide'}];
 return t;
}
export function valid(t=sectionTemplate()) {const r=validateTemplate(t);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error('Invalid fixture');return r.value;}

import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
export function composed(t=sectionTemplate(),content:any[]=[{format:'section-note',data:{text:'Body'}}]){
 const v=valid(t),p=prepareGeneration(v,{docKey:t.docKey,data:{projectName:'Demo'},sections:t.sections.map((s:any)=>({sectionKey:s.sectionKey,instanceKey:s.sectionKey,data:Object.hasOwn(s.inputSchema.fields,'details')?{details:content}:{}}))});if(!p.ok)throw Error(JSON.stringify(p));
 const r=composeDocument(v,p.value);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error('Composition failed');return r.value;
}
