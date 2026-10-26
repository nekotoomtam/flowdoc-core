import {it,expect} from 'vitest';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
const take=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
function template(model:number){const t=ownedTemplate();if(model!==18){for(const [i,s]of t.sections.entries()){s.id=`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;s.nameBase='Section';s.label='Section '+i;delete s.key;delete s.formats;if(model===20)s.sectionKey='s'+i;}t.nodeModelVersion=model;}return t;}
it.each([18,19,20])('retains a normalized defaultFileName as versioned model%d metadata',model=>{
 const t=template(model),before=take(validateTemplate(t));t.defaultFileName='  รายงาน CLIS 2602S  ';const next=take(validateTemplate(t));
 expect(next.definition.defaultFileName).toBe('รายงาน CLIS 2602S');expect(next.fingerprint).not.toBe(before.fingerprint);expect(t.defaultFileName).toBe('  รายงาน CLIS 2602S  ');
});
it('keeps omitted/cleared defaults equivalent and composition unchanged',()=>{
 const t=ownedTemplate(),v=take(validateTemplate(t));const blank=take(validateTemplate({...t,defaultFileName:'  '}));expect(blank.fingerprint).toBe(v.fingerprint);expect(blank.definition).not.toHaveProperty('defaultFileName');
 const named=take(validateTemplate({...t,defaultFileName:'CLIS'})),q=ownedRequest(t);
 expect(take(composeDocument(named,take(prepareGeneration(named,q))))).toEqual(take(composeDocument(v,take(prepareGeneration(v,q)))));
});
it.each([null,3,{},'../report','a/b','a\\b','a\nb','a\u202Eb','CON','lpt1','NUL.txt','report.','x.pdf','x.DOCX','*','a'.repeat(201),'ก'.repeat(81)])('rejects an invalid base-name setting: %j',name=>{
 expect(validateTemplate({...ownedTemplate(),defaultFileName:name}).ok).toBe(false);
});
it('normalizes Unicode metadata without changing the old omitted definition',()=>{
 const t=ownedTemplate(),a=take(validateTemplate({...t,defaultFileName:'Cafe\u0301'})),b=take(validateTemplate({...t,defaultFileName:'Café'}));expect(a.fingerprint).toBe(b.fingerprint);expect(t).not.toHaveProperty('defaultFileName');
});
