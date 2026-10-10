import {expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {areaTemplate} from './areas.js';
export function sectionAreaTemplate():any {
 const t=sectionTemplate(),a=areaTemplate();
 t.globalSchema.fields.details={type:'area',areaId:'area-001'};
 t.areaFormats=a.areaFormats;
 t.sections.push({id:'appendix',source:{kind:'authored',repeats:[],fragment:{rootIds:['placement'],nodes:{placement:{id:'placement',type:'area',props:{areaId:'area-001'}}}}}});
 return t;
}
export function sectionTemplate():any {
 const t=JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8'));
 t.nodeModelVersion=12;t.examples=[];
 t.pageLayouts={normal:{page:t.book.page},wide:{page:{...structuredClone(t.book.page),orientation:'landscape'}}};
 t.book={contentSlot:'body',defaultPageLayoutId:'normal'};
 t.sections=[{id:'intro',source:{kind:'authored',repeats:[],fragment:{rootIds:['title'],nodes:{title:{id:'title',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'name',type:'field-ref',scope:'global',key:'projectName'}]}}}}},{id:'main',pageLayoutId:'wide',source:{kind:'content'}}];
 return t;
}
export function valid(t=sectionTemplate()) {const r=validateTemplate(t);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error('Invalid fixture');return r.value;}

import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
export function composed(t=sectionTemplate(),content:any[]=[{format:'section-note',data:{text:'Body'}}]){
 const v=valid(t),p=prepareGeneration(v,{docKey:t.docKey,data:{projectName:'Demo'},content});if(!p.ok)throw Error(JSON.stringify(p));
 const r=composeDocument(v,p.value);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error('Composition failed');return r.value;
}
