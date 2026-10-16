import type {Template19,ValidatedTemplate} from '../template/types.js';
import type {PreparedInput,PreparedSection19} from './types.js';
import type {Result,Issue} from '../result.js';
import {object,keys,own,isJson,issue} from '../template/checks.js';
import {buildAreaIndex} from '../template/areas.js';
import {validateValues} from './validateValues.js';

export function prepareInstances(t:Template19,fingerprint:string,input:unknown):Result<PreparedInput>{
 const issues:Issue[]=[],warnings:Issue[]=[],fail=(c:string,p:string)=>issues.push(issue(c,p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_DATA','request')],warnings};
 if(!keys(input,['docKey','version','data','sections'])||input.docKey!==t.docKey||(own(input,'version')&&input.version!==t.version))fail('INVALID_DATA','request');
 if(!Array.isArray(input.sections))return {ok:false,issues:[issue('SECTION_INPUT_SHAPE','sections')],warnings};
 const entries=new Map<string,Record<string,any>>();
 input.sections.forEach((e:any,i:number)=>{
  const path=`sections[${i}]`;
  if(!object(e)){fail('SECTION_INPUT_SHAPE',path);return;}
  if(typeof e.id!=='string'){fail('SECTION_ID_REQUIRED',path+'.id');return;}
  if(entries.has(e.id))fail('SECTION_INPUT_DUPLICATE',path+'.id');
  if(!t.sections.some(s=>s.id===e.id))fail('SECTION_INPUT_UNKNOWN',path+'.id');
  if(!keys(e,['id','data','header','footer'])||!object(e.data))fail('INVALID_DATA',path);
  entries.set(e.id,e);
 });
 const index=buildAreaIndex(t),data=validateValues(t.globalSchema,own(input,'data')?input.data:{},'data',issues,warnings,'request',false,index);
 const sections:PreparedSection19[]=[];
 for(const s of t.sections){
  const path='sections.'+s.id,e=entries.get(s.id);
  if(!e){fail('SECTION_INPUT_MISSING',path);continue;}
  const value:PreparedSection19={id:s.id,data:validateValues(s.inputSchema,e.data,path+'.data',issues,warnings,'request',false,index)};
  for(const band of ['header','footer'] as const){
   if(s[band])value[band]=validateValues(s[band]!.inputSchema,own(e,band)?e[band]:{},path+'.'+band,issues,warnings);
   else if(own(e,band))fail('INVALID_DATA',path+'.'+band);
  }
  sections.push(value);
 }
 // Model19 never silently discards unknown variables, including nested Area/array values.
 issues.push(...warnings.map(({action,...w})=>({...w,code:'INVALID_DATA'})));warnings.length=0;
 if(issues.length)return {ok:false,issues,warnings};
 return {ok:true,value:{schemaVersion:2,template:{templateId:t.templateId,docKey:t.docKey,version:t.version,fingerprint,nodeModelVersion:19},data,sections,content:[],originalContentCount:0,skippedContentIndices:[],warnings:[]},warnings};
}

export function validatePreparedInstances(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{
 const t=template.definition as Template19,fail=():Result<PreparedInput>=>({ok:false,issues:[issue('INVALID_DATA','prepared')],warnings:[]});
 if(!isJson(input)||!object(input))return fail();
 if(object(input)&&(input.schemaVersion!==2||!object(input.template)||input.template.nodeModelVersion!==19))return {ok:false,issues:[issue('VERSION_MISMATCH','prepared')],warnings:[]};
 if(!isJson(input)||!object(input)||!keys(input,['schemaVersion','template','data','sections','content','originalContentCount','skippedContentIndices','warnings'])||input.schemaVersion!==2||!object(input.template)||!keys(input.template,['templateId','docKey','version','fingerprint','nodeModelVersion'])||input.template.nodeModelVersion!==19||input.template.templateId!==t.templateId||input.template.docKey!==t.docKey||input.template.version!==t.version||input.template.fingerprint!==template.fingerprint||!Array.isArray(input.sections)||input.sections.length!==t.sections.length||!Array.isArray(input.content)||input.content.length||input.originalContentCount!==0||!Array.isArray(input.skippedContentIndices)||input.skippedContentIndices.length||!Array.isArray(input.warnings)||input.warnings.length)return fail();
 const index=buildAreaIndex(t),issues:Issue[]=[],warnings:Issue[]=[];
 validateValues(t.globalSchema,input.data,'data',issues,warnings,'prepared',false,index);
 for(const [i,s] of t.sections.entries()){
  const e=input.sections[i],path=`sections[${i}]`;
  if(!object(e)||!keys(e,['id','data','header','footer'])||e.id!==s.id)return fail();
  validateValues(s.inputSchema,e.data,path+'.data',issues,warnings,'prepared',false,index);
  for(const band of ['header','footer'] as const){if(s[band])validateValues(s[band]!.inputSchema,e[band],path+'.'+band,issues,warnings,'prepared');else if(own(e,band))return fail();}
 }
 return issues.length?fail():{ok:true,value:input as unknown as PreparedInput,warnings:[]};
}
