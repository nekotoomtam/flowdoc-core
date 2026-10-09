import {validateAreas} from './areas.js';
import {createHash} from 'node:crypto';
import type {Result,Issue} from '../result.js';
import type {TemplateDefinition,ValidatedTemplate} from './types.js';
import {readTemplateJson} from './readTemplateJson.js';
import {object,keys,name,own,isJson,freeze,canonical,issue} from './checks.js';
import {validateSchemas} from './validateSchemas.js';
import {validateGraph} from './validateGraph.js';
import {validateBookStyles} from '../composition/validateResolvedDocument.js';
import {prepareWithDefinition} from '../data/prepareGeneration.js';
export function validateTemplate(input:unknown):Result<ValidatedTemplate>{
 const issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_TEMPLATE',p));
 try {
  if(typeof input==='string'){const r=readTemplateJson(input);if(!r.ok)return r;input=r.value;}
  if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_TEMPLATE','template')],warnings:[]};
  const t=structuredClone(input);
  if(!keys(t,['schemaVersion','nodeModelVersion','templateId','docKey','version','name','book','globalSchema','styles','formats','examples',...(t.nodeModelVersion>=11?['areaFormats']:[])])||t.schemaVersion!==1||![4,5,6,7,8,9,10,11].includes(t.nodeModelVersion))fail('template');
  for(const k of ['templateId','docKey','name'])if(!name(t[k]))fail(k);
  if(!Number.isInteger(t.version)||t.version<1)fail('version');
  issues.push(...validateBookStyles(t).map(i=>({...i,code:'INVALID_TEMPLATE'})));
  const globalOk=validateSchemas(t.globalSchema,'globalSchema',issues,false,t.nodeModelVersion>=5,t.nodeModelVersion>=7,t.nodeModelVersion>=10,t.nodeModelVersion>=11);
  if(!object(t.formats)||!Object.keys(t.formats).length)fail('formats');else for(const [key,f] of Object.entries(t.formats)){
   const p='formats.'+key;
   if(!name(key)||!object(f)||!keys(f,['label','description','inputSchema','fragment','repeats',...(t.nodeModelVersion>=10?['cellRepeats']:[])])){fail(p);continue;}
   for(const k of ['label','description'])if(Object.hasOwn(f,k)&&typeof f[k]!=='string')fail(p+'.'+k);
   const localOk=validateSchemas(f.inputSchema,p+'.inputSchema',issues,false,t.nodeModelVersion>=5,t.nodeModelVersion>=7,t.nodeModelVersion>=10,t.nodeModelVersion>=11);
   if(!Array.isArray(f.repeats)||(own(f,'cellRepeats')&&!Array.isArray(f.cellRepeats)))fail(p+'.repeats');
   else if(globalOk&&localOk&&object(t.styles))issues.push(...validateGraph(f.fragment,{styles:t.styles,globalSchema:t.globalSchema,localSchema:f.inputSchema,repeats:f.repeats,images:t.nodeModelVersion>=5,merged:t.nodeModelVersion>=6,links:t.nodeModelVersion>=7,contents:t.nodeModelVersion>=8,cellContent:t.nodeModelVersion>=9,itemImages:t.nodeModelVersion>=10,cellRepeats:f.cellRepeats,areas:t.nodeModelVersion>=11},p+'.fragment'));
  }
  if(!issues.length&&t.nodeModelVersion>=11)issues.push(...validateAreas(t as TemplateDefinition));
  if(!Array.isArray(t.examples))fail('examples');
  if(issues.length)return {ok:false,issues,warnings:[]};
  const definition=t as TemplateDefinition,fingerprint=createHash('sha256').update(canonical(t)).digest('hex');
  const names=new Set<string>();
  for(const [i,e] of definition.examples.entries()){
   const p=`examples[${i}]`;
   if(!object(e)||!keys(e,['name','request'])||!name(e.name)||names.has(e.name)){fail(p);continue;}names.add(e.name);
   if(!object(e.request)||e.request.version!==t.version)fail(p+'.request.version');
   const r=prepareWithDefinition(definition,fingerprint,e.request);
   issues.push(...[...(!r.ok?r.issues:[]),...r.warnings].map(x=>({...x,code:'INVALID_TEMPLATE',path:p+'.request.'+x.path})));
  }
  return issues.length?{ok:false,issues,warnings:[]}:{ok:true,value:freeze({definition,fingerprint}),warnings:[]};
 }catch{return {ok:false,issues:[issue('INVALID_TEMPLATE','template')],warnings:[]};}
}
