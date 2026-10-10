import type {Template15,Section15,ValidatedTemplate} from '../template/types.js';
import type {PreparedInput,PreparedSection} from './types.js';
import type {Result,Issue} from '../result.js';
import {object,keys,own,isJson,name,issue,canonical} from '../template/checks.js';
import {buildAreaIndex} from '../template/areas.js';
import {validateValues} from './validateValues.js';
import {validatePreparedInput} from '../composition/validatePreparedInput.js';
export function prepareSections(t:Template15,fingerprint:string,input:unknown):Result<PreparedInput>{
 const issues:Issue[]=[],warnings:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_DATA',p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_DATA','request')],warnings};
 if(!keys(input,['docKey','version','data','sections']))fail('request');
 if(input.docKey!==t.docKey)fail('docKey');if(own(input,'version')&&input.version!==t.version)fail('version');
 const raw=own(input,'sections')?input.sections:{};
 if(!object(raw))fail('sections');else for(const key of Object.keys(raw))if(!t.sections.some(s=>s.key===key))issues.push(issue('UNKNOWN_SECTION','sections.'+key,'Allowed sections: '+t.sections.map(s=>s.key).join(', ')));
 const index=buildAreaIndex(t),data=validateValues(t.globalSchema,own(input,'data')?input.data:{},'data',issues,warnings,'request',false,index),sections:Record<string,PreparedSection>=Object.create(null);
 for(const s of t.sections){const path='sections.'+s.key,entry=object(raw)&&own(raw,s.key)?raw[s.key]:{},sw:Issue[]=[];
  if(!object(entry)||!keys(entry,['data','header','footer','content'])){fail(path);continue;}
  const value:PreparedSection={key:s.key,data:validateValues(s.inputSchema,own(entry,'data')?entry.data:{},path+'.data',issues,sw,'request',false,index),content:[],originalContentCount:0,skippedContentIndices:[],warnings:sw};
  for(const k of ['header','footer'] as const){if(s[k])value[k]=validateValues(s[k]!.inputSchema,own(entry,k)?entry[k]:{},path+'.'+k,issues,sw);else if(own(entry,k)){if(!object(entry[k]))fail(path+'.'+k);else for(const key of Object.keys(entry[k]))sw.push({...issue('UNKNOWN_VARIABLE',path+'.'+k+'.'+key),action:'ignored'});}}
  const content=own(entry,'content')?entry.content:[];
  if(!Array.isArray(content))fail(path+'.content');else{value.originalContentCount=content.length;if(s.source.kind!=='content'&&content.length)fail(path+'.content');
   content.forEach((e:unknown,i:number)=>{const ep=path+`.content[${i}]`;
    if(!object(e)||!keys(e,['format','data'])||!name(e.format)){fail(ep);return;}
    if(!own(s.formats,e.format)){if(!own(e,'data'))issues.push(issue('MISSING_REQUIRED',ep+'.data'));else {value.skippedContentIndices.push(i);sw.push({...issue('UNKNOWN_FORMAT',ep+'.format','Unknown format skipped'),action:'skipped',contentIndex:i,format:e.format});}return;}
    const start=issues.length,ws=sw.length,local=validateValues(s.formats[e.format]!.inputSchema,e.data,ep+'.data',issues,sw,'request',!own(e,'data'),index);
    for(const w of [...issues.slice(start),...sw.slice(ws)]){w.contentIndex=i;w.format=e.format;}
    if(issues.length===start)value.content.push({originalIndex:i,format:e.format,data:local});
   });
  }
  for(const a of index.byId.values())if(a.scope!=='local'&&value.content.filter(c=>Object.values(s.formats[c.format]!.fragment.nodes).some(n=>n.type==='area'&&n.props.areaId===a.field.areaId)).length>1)fail(path+'.content');
  sections[s.id]=value;warnings.push(...sw);
 }
 if(issues.length)return {ok:false,issues,warnings};
 return {ok:true,value:{schemaVersion:1,template:{templateId:t.templateId,docKey:t.docKey,version:t.version,fingerprint},data,sections,content:[],originalContentCount:0,skippedContentIndices:[],warnings:structuredClone(warnings)},warnings};
}
// Reuse legacy index/warning integrity checks with a scoped view, never a persisted conversion.
function proxy(t:Template15,s?:Section15):any {const base={...t,nodeModelVersion:14,globalSchema:s?.inputSchema??t.globalSchema,formats:s?.formats??{},sections:[{id:'validate',source:{kind:'authored',fragment:{rootIds:[],nodes:{}},repeats:[]} },...(s?.source.kind==='content'?[{id:'content',source:{kind:'content'}}]:[])]};delete (base as any).header;delete (base as any).footer;return {...base,...(s?.header?{header:s.header}:{}),...(s?.footer?{footer:s.footer}:{})};}
export function validatePreparedSections(template:ValidatedTemplate&{definition:Template15},input:unknown):Result<PreparedInput>{
 const t=template.definition,issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_DATA',p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_DATA','prepared')],warnings:[]};
 const p=input;
 if(!keys(p,['schemaVersion','template','data','sections','content','originalContentCount','skippedContentIndices','warnings'])||!object(p.sections)||!Array.isArray(p.warnings)||!Array.isArray(p.content)||p.content.length||p.originalContentCount!==0||!Array.isArray(p.skippedContentIndices)||p.skippedContentIndices.length)return {ok:false,issues:[issue('INVALID_DATA','prepared')],warnings:[]};
 const globalWarnings=p.warnings.filter((w:any)=>object(w)&&typeof w.path==='string'&&w.path.startsWith('data.'));
 const root=validatePreparedInput({definition:proxy(t),fingerprint:template.fingerprint},{schemaVersion:p.schemaVersion,template:p.template,data:p.data,content:[],originalContentCount:0,skippedContentIndices:[],warnings:globalWarnings});if(!root.ok)issues.push(...root.issues);
 const collected:Issue[]=[...globalWarnings];
 for(const key of Object.keys(p.sections))if(!t.sections.some(s=>s.id===key))fail('sections.'+key);
 for(const s of t.sections){const v=p.sections[s.id],path='sections.'+s.key;
  if(!object(v)||!keys(v,['key','data','header','footer','content','originalContentCount','skippedContentIndices','warnings'])||v.key!==s.key||!Array.isArray(v.warnings)){fail(path);continue;}
  if(s.source.kind!=='content'&&v.originalContentCount!==0)fail(path+'.content');
  const ws=v.warnings.map((w:any)=>{if(!object(w)||typeof w.path!=='string'||!w.path.startsWith(path+'.')){fail(path+'.warnings');return w;}return {...w,path:w.path.slice(path.length+1)};});
  const {key:_,...body}=v;
  const r=validatePreparedInput({definition:proxy(t,s),fingerprint:template.fingerprint},{...body,schemaVersion:p.schemaVersion,template:p.template,warnings:ws});
  if(!r.ok)issues.push(...r.issues.map(i=>({...i,path:path+'.'+i.path})));collected.push(...v.warnings);
 }
 if(canonical(collected)!==canonical(p.warnings))fail('warnings');
 return issues.length?{ok:false,issues,warnings:[]}:{ok:true,value:structuredClone(p) as PreparedInput,warnings:structuredClone(p.warnings)};
}
