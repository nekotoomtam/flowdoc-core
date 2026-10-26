import type {Template20,ValidatedTemplate} from '../template/types.js';
import type {PreparedInput,PreparedSection20} from './types.js';
import type {Issue,Result} from '../result.js';
import {object,keys,own,isJson,issue} from '../template/checks.js';
import {buildAreaIndex} from '../template/areas.js';
import {validateValues} from './validateValues.js';
export const assemblyKey=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
export const instanceSectionId=(key:string)=>'instance-'+key;
export function prepareAssembly(t:Template20,fingerprint:string,input:unknown):Result<PreparedInput>{
 const issues:Issue[]=[],warnings:Issue[]=[],fail=(c:string,p:string)=>issues.push(issue(c,p));
 if(!isJson(input)||!object(input)||!keys(input,['docKey','version','data','sections'])||input.docKey!==t.docKey||(own(input,'version')&&input.version!==t.version))return {ok:false,issues:[issue('INVALID_DATA','request')],warnings};
 if(!Array.isArray(input.sections))return {ok:false,issues:[issue('SECTION_INPUT_SHAPE','sections')],warnings};
 if(!input.sections.length)fail('SECTION_ASSEMBLY_EMPTY','sections');
 if(input.sections.length>2000)return {ok:false,issues:[issue('LIMIT_EXCEEDED','sections')],warnings};
 const index=buildAreaIndex(t),data=validateValues(t.globalSchema,own(input,'data')?input.data:{},'data',issues,warnings,'request',false,index),seen=new Set<string>(),sections:PreparedSection20[]=[];
 for(const [i,e] of input.sections.entries()){
  const path=`sections[${i}]`;
  if(!object(e)||!keys(e,['sectionKey','instanceKey','data','header','footer'])){fail('SECTION_INPUT_SHAPE',path);continue;}
  const s=t.sections.find(s=>s.sectionKey===e.sectionKey);
  if(!s){fail('SECTION_KEY_UNKNOWN',path+'.sectionKey');continue;}
  if(!assemblyKey(e.instanceKey)){fail('SECTION_INSTANCE_REQUIRED',path+'.instanceKey');continue;}
  if(seen.has(e.instanceKey))fail('SECTION_INSTANCE_DUPLICATE',path+'.instanceKey');seen.add(e.instanceKey);
  if(!object(e.data)){fail('INVALID_DATA',path+'.data');continue;}
  const value:PreparedSection20={id:s.id,sectionKey:s.sectionKey,instanceKey:e.instanceKey,data:validateValues(s.inputSchema,e.data,path+'.data',issues,warnings,'request',false,index)};
  for(const band of ['header','footer'] as const){if(s[band])value[band]=validateValues(s[band]!.inputSchema,own(e,band)?e[band]:{},path+'.'+band,issues,warnings);else if(own(e,band))fail('INVALID_DATA',path+'.'+band);}
  sections.push(value);
 }
 issues.push(...warnings.map(({action,...w})=>({...w,code:'INVALID_DATA'})));
 return issues.length?{ok:false,issues,warnings:[]}:{ok:true,value:{schemaVersion:3,template:{templateId:t.templateId,docKey:t.docKey,version:t.version,fingerprint,nodeModelVersion:20},data,sections,content:[],originalContentCount:0,skippedContentIndices:[],warnings:[]},warnings:[]};
}
export function validatePreparedAssembly(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{
 const t=template.definition as Template20,fail=():Result<PreparedInput>=>({ok:false,issues:[issue('INVALID_DATA','prepared')],warnings:[]});
 if(!isJson(input)||!object(input)||!keys(input,['schemaVersion','template','data','sections','content','originalContentCount','skippedContentIndices','warnings'])||input.schemaVersion!==3||!object(input.template)||!keys(input.template,['templateId','docKey','version','fingerprint','nodeModelVersion'])||input.template.nodeModelVersion!==20||input.template.templateId!==t.templateId||input.template.docKey!==t.docKey||input.template.version!==t.version||input.template.fingerprint!==template.fingerprint||!Array.isArray(input.sections)||!input.sections.length||input.sections.length>2000||!Array.isArray(input.content)||input.content.length||input.originalContentCount!==0||!Array.isArray(input.skippedContentIndices)||input.skippedContentIndices.length||!Array.isArray(input.warnings)||input.warnings.length)return fail();
 const index=buildAreaIndex(t),issues:Issue[]=[],warnings:Issue[]=[],seen=new Set<string>();
 validateValues(t.globalSchema,input.data,'data',issues,warnings,'prepared',false,index);
 for(const [i,e]of input.sections.entries()){
  if(!object(e)||!keys(e,['id','sectionKey','instanceKey','data','header','footer'])||!assemblyKey(e.instanceKey)||seen.has(e.instanceKey))return fail();seen.add(e.instanceKey);
  const s=t.sections.find(s=>s.sectionKey===e.sectionKey);if(!s||e.id!==s.id)return fail();
  validateValues(s.inputSchema,e.data,`sections[${i}].data`,issues,warnings,'prepared',false,index);
  for(const band of ['header','footer']as const){if(s[band])validateValues(s[band]!.inputSchema,e[band],`sections[${i}].${band}`,issues,warnings,'prepared');else if(own(e,band))return fail();}
 }
 return issues.length||warnings.length?fail():{ok:true,value:input as unknown as PreparedInput,warnings:[]};
}
