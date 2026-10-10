import {buildAreaIndex} from '../template/areas.js';
import type {Result,Issue} from '../result.js';
import type {ValidatedTemplate} from '../template/types.js';
import type {PreparedInput} from '../data/types.js';
import {object,keys,own,name,isJson,issue} from '../template/checks.js';
import {validateValues} from '../data/validateValues.js';
export function validatePreparedInput(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{
 const issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_DATA',p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_DATA','prepared')],warnings:[]};
 const p=input,t=template.definition,areaIndex=t.nodeModelVersion>=11?buildAreaIndex(t):undefined;
 if(!keys(p,['schemaVersion','template','data','content','originalContentCount','skippedContentIndices','warnings'])||p.schemaVersion!==1)fail('prepared');
 if(!object(p.template)||!keys(p.template,['templateId','docKey','version','fingerprint'])||p.template.templateId!==t.templateId||p.template.docKey!==t.docKey||p.template.version!==t.version||p.template.fingerprint!==template.fingerprint)fail('template');
 if(!Number.isSafeInteger(p.originalContentCount)||p.originalContentCount<1)fail('originalContentCount');
 validateValues(t.globalSchema,p.data,'data',issues,[],'prepared',false,areaIndex);
 const seen=new Set<number>(),accepted=new Map<number,string>(),skipped=new Set<number>();let previous=-1;
 const index=(i:unknown)=>typeof i==='number'&&Number.isSafeInteger(i)&&i>=0&&i<p.originalContentCount;
 if(!Array.isArray(p.content)||!p.content.length)fail('content');else for(const [i,c] of p.content.entries()){
  const path=`content[${i}]`;
  if(!object(c)||!keys(c,['originalIndex','format','data'])||!index(c.originalIndex)||c.originalIndex<=previous||seen.has(c.originalIndex)||!name(c.format)||!own(t.formats,c.format)){fail(path);continue;}
  previous=c.originalIndex;seen.add(c.originalIndex);accepted.set(c.originalIndex,c.format);
  validateValues(t.formats[c.format]!.inputSchema,c.data,`content[${c.originalIndex}].data`,issues,[],'prepared',false,areaIndex);
 }
 previous=-1;
 if(!Array.isArray(p.skippedContentIndices))fail('skippedContentIndices');else for(const i of p.skippedContentIndices){
  if(!index(i)||i<=previous||seen.has(i))fail('skippedContentIndices');else {seen.add(i);skipped.add(i);}previous=i;
 }
 if(seen.size!==p.originalContentCount)fail('originalContentCount');
 const areaSkips=new Set<string>(),warnedAreas=new Set<string>();
 const collect=(data:any,path:string)=>{if(object(data))for(const [key,v] of Object.entries(data))if(object(v)&&v.kind==='area'&&Array.isArray(v.skippedIndices))for(const i of v.skippedIndices)areaSkips.add(`${path}.${key}[${i}]`);};
 if(areaIndex){collect(p.data,'data');if(Array.isArray(p.content))for(const c of p.content)if(object(c))collect(c.data,`content[${c.originalIndex}].data`);
 for(const a of areaIndex.byId.values())if(a.scope==='global'&&Array.isArray(p.content)&&p.content.filter((c:any)=>object(c)&&own(t.formats,c.format)&&Object.values(t.formats[c.format]!.fragment.nodes).some(n=>n.type==='area'&&n.props.areaId===a.field.areaId)).length>1)fail('content');}
 const warnedSkips=new Set<number>();
 if(!Array.isArray(p.warnings))fail('warnings');else for(const [i,w] of p.warnings.entries()){
  const path=`warnings[${i}]`;
  if(!object(w)||!keys(w,['code','path','message','action','contentIndex','format',...(w.code==='AREA_ENTRY_SKIPPED'&&areaIndex?['expectedType','actualType']:[])])||!name(w.path)||!name(w.message)){fail(path);continue;}
  if(w.code==='AREA_ENTRY_SKIPPED'&&areaIndex){
   if((own(w,'expectedType')||own(w,'actualType'))&&(!['string','image','array','object'].includes(w.expectedType)||!['string','number','boolean','object','array','null'].includes(w.actualType)))fail(path);
   const prefix=[...areaSkips].find(p=>w.path===p||w.path.startsWith(p+'.'));
   if(w.action!=='skipped'||!prefix)fail(path);else warnedAreas.add(prefix);
   if(own(w,'contentIndex')||own(w,'format')){if(!index(w.contentIndex)||accepted.get(w.contentIndex)!==w.format||!w.path.startsWith(`content[${w.contentIndex}].data.`))fail(path);}
   else if(!w.path.startsWith('data.'))fail(path);
  }else if(w.code==='UNKNOWN_FORMAT'){
   if(w.action!=='skipped'||!index(w.contentIndex)||!skipped.has(w.contentIndex)||warnedSkips.has(w.contentIndex)||!name(w.format)||own(t.formats,w.format)||w.path!==`content[${w.contentIndex}].format`)fail(path);
   else warnedSkips.add(w.contentIndex);
  }else if(w.code==='UNKNOWN_VARIABLE'){
   if(w.action!=='ignored')fail(path);
   if(own(w,'contentIndex')||own(w,'format')){if(!index(w.contentIndex)||accepted.get(w.contentIndex)!==w.format||!w.path.startsWith(`content[${w.contentIndex}].data.`))fail(path);}
   else if(!w.path.startsWith('data.'))fail(path);
  }else fail(path);
 }
 if(warnedAreas.size!==areaSkips.size)fail('warnings');
 if(warnedSkips.size!==skipped.size)fail('warnings');
 return issues.length?{ok:false,issues:issues.map(i=>({...i,code:'INVALID_DATA'})),warnings:[]}:{ok:true,value:structuredClone(p) as PreparedInput,warnings:structuredClone(p.warnings)};
}
