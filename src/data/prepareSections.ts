import type {Template18,AreaSection,ValidatedTemplate} from '../template/types.js';
import type {PreparedInput,PreparedSection} from './types.js';
import type {Result,Issue} from '../result.js';
import {object,keys,own,isJson,name,issue,canonical} from '../template/checks.js';
import {buildAreaIndex} from '../template/areas.js';
import {validateValues} from './validateValues.js';
import {prepareAreaValue} from './prepareAreas.js';

export function prepareSections(t:Template18,fingerprint:string,input:unknown):Result<PreparedInput>{
 const issues:Issue[]=[],warnings:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_DATA',p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_DATA','request')],warnings};
 if(!keys(input,['docKey','version','data','sections']))fail('request');
 if(input.docKey!==t.docKey)fail('docKey');if(own(input,'version')&&input.version!==t.version)fail('version');
 const raw=own(input,'sections')?input.sections:{};
 if(!object(raw))fail('sections');else for(const key of Object.keys(raw))if(!t.sections.some(s=>s.key===key))issues.push(issue('UNKNOWN_SECTION','sections.'+key,'Allowed sections: '+t.sections.map(s=>s.key).join(', ')));
 const index=buildAreaIndex(t),data=validateValues(t.globalSchema,own(input,'data')?input.data:{},'data',issues,warnings,'request',false,index),sections:Record<string,PreparedSection>=Object.create(null);
 for(const s of t.sections){const path='sections.'+s.key,entry=object(raw)&&own(raw,s.key)?raw[s.key]:{},sw:Issue[]=[];
  if(!object(entry)||!keys(entry,['data','header','footer'])){fail(path);continue;}
  const value:PreparedSection={key:s.key,data:validateValues(s.inputSchema,own(entry,'data')?entry.data:{},path+'.data',issues,sw,'request',false,index),content:[],originalContentCount:0,skippedContentIndices:[],warnings:sw};
  for(const k of ['header','footer'] as const){if(s[k])value[k]=validateValues(s[k]!.inputSchema,own(entry,k)?entry[k]:{},path+'.'+k,issues,sw);else if(own(entry,k)){if(!object(entry[k]))fail(path+'.'+k);else for(const key of Object.keys(entry[k]))sw.push({...issue('UNKNOWN_VARIABLE',path+'.'+k+'.'+key),action:'ignored'});}}
  sections[s.id]=value;warnings.push(...sw);
 }
 if(issues.length)return {ok:false,issues,warnings};
 return {ok:true,value:{schemaVersion:1,template:{templateId:t.templateId,docKey:t.docKey,version:t.version,fingerprint},data,sections,content:[],originalContentCount:0,skippedContentIndices:[],warnings:structuredClone(warnings)},warnings};
}
// Validate the Area18 snapshot directly; no legacy-model proxy or content reader.
export function validatePreparedSections(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{
 const t=template.definition as Template18,index=buildAreaIndex(t),issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_DATA',p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_DATA','prepared')],warnings:[]};
 const p=input;
 const emptyContent=(v:any,path:string)=>{if(!Array.isArray(v.content)||v.content.length||v.originalContentCount!==0||!Array.isArray(v.skippedContentIndices)||v.skippedContentIndices.length)fail(path+'.content');};
 if(!keys(p,['schemaVersion','template','data','sections','content','originalContentCount','skippedContentIndices','warnings'])||p.schemaVersion!==1||!object(p.sections)||!Array.isArray(p.warnings))return {ok:false,issues:[issue('INVALID_DATA','prepared')],warnings:[]};
 if(!object(p.template)||!keys(p.template,['templateId','docKey','version','fingerprint'])||p.template.templateId!==t.templateId||p.template.docKey!==t.docKey||p.template.version!==t.version||p.template.fingerprint!==template.fingerprint)fail('template');
 emptyContent(p,'prepared');
 const checkWarnings=(ws:unknown,prefixes:string[],path:string):Issue[]=>{
  if(!Array.isArray(ws)){fail(path);return [];}
  for(const [i,w] of ws.entries())if(!object(w)||!keys(w,['code','path','message','action'])||w.code!=='UNKNOWN_VARIABLE'||w.action!=='ignored'||!name(w.path)||!name(w.message)||!prefixes.some(prefix=>w.path.startsWith(prefix)))fail(path+'['+i+']');
  return ws;
 };
 validateValues(t.globalSchema,p.data,'data',issues,[],'prepared',false,index);
 const globalWarnings=p.warnings.filter((w:any)=>object(w)&&typeof w.path==='string'&&w.path.startsWith('data.'));
 checkWarnings(globalWarnings,['data.'],'warnings');
 const collected:Issue[]=[...globalWarnings];
 for(const key of Object.keys(p.sections))if(!t.sections.some(s=>s.id===key))fail('sections.'+key);
 for(const s of t.sections){
  const v=p.sections[s.id],path='sections.'+s.key;
  if(!object(v)||!keys(v,['key','data','header','footer','content','originalContentCount','skippedContentIndices','warnings'])||v.key!==s.key){fail(path);continue;}
  emptyContent(v,path);
  validateValues(s.inputSchema,v.data,path+'.data',issues,[],'prepared',false,index);
  for(const k of ['header','footer'] as const){if(s[k])validateValues(s[k]!.inputSchema,v[k],path+'.'+k,issues,[],'prepared');else if(own(v,k))fail(path+'.'+k);}
  collected.push(...checkWarnings(v.warnings,[path+'.data.',path+'.header.',path+'.footer.'],path+'.warnings'));
 }
 if(canonical(collected)!==canonical(p.warnings))fail('warnings');
 return issues.length?{ok:false,issues:issues.map(i=>({...i,code:'INVALID_DATA'})),warnings:[]}:{ok:true,value:p as PreparedInput,warnings:p.warnings};
}
