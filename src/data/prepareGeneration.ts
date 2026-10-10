import {buildAreaIndex} from '../template/areas.js';
import type {Result,Issue} from '../result.js';
import type {ValidatedTemplate,TemplateDefinition} from '../template/types.js';
import type {PreparedInput} from './types.js';
import {object,keys,own,name,isJson,issue} from '../template/checks.js';
import {validateValues} from './validateValues.js';
export function prepareGeneration(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{
 return prepareWithDefinition(template.definition,template.fingerprint,input);
}
// Registration examples use this operation without recursively registering a template.
export function prepareWithDefinition(t:TemplateDefinition,fingerprint:string,input:unknown):Result<PreparedInput>{
 const issues:Issue[]=[],warnings:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_DATA',p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_DATA','request')],warnings};
 if(!keys(input,['docKey','version','data','content']))fail('request');
 if(input.docKey!==t.docKey)fail('docKey');if(own(input,'version')&&input.version!==t.version)fail('version');
 const areaIndex=t.nodeModelVersion>=11?buildAreaIndex(t):undefined;
 const data=validateValues(t.globalSchema,input.data,'data',issues,warnings,'request',!own(input,'data'),areaIndex);
 const content:PreparedInput['content']=[],skippedContentIndices:number[]=[];
 if(!Array.isArray(input.content))fail('content');else input.content.forEach((entry:unknown,index:number)=>{
  const p=`content[${index}]`;
  if(!object(entry)||!keys(entry,['format','data'])||!name(entry.format)){fail(p);return;}
  const format=entry.format;
  if(!own(t.formats,format)){
   if(!own(entry,'data')){issues.push(issue('MISSING_REQUIRED',p+'.data'));return;}
   skippedContentIndices.push(index);warnings.push({...issue('UNKNOWN_FORMAT',p+'.format','Unknown format skipped'),action:'skipped',contentIndex:index,format});return;
  }
  const before=issues.length,wstart=warnings.length;
  const local=validateValues(t.formats[format]!.inputSchema,entry.data,p+'.data',issues,warnings,'request',!own(entry,'data'),areaIndex);
  for(const i of [...issues.slice(before),...warnings.slice(wstart)]){i.contentIndex=index;i.format=format;}
  if(before===issues.length)content.push({originalIndex:index,format,data:local});
 });
 if(areaIndex)for(const a of areaIndex.byId.values())if(a.scope==='global'){const count=content.filter(c=>Object.values(t.formats[c.format]!.fragment.nodes).some(n=>n.type==='area'&&n.props.areaId===a.field.areaId)).length;if(count>1)fail('content');}
 if(t.nodeModelVersion===12&&!t.sections.some(s=>s.source.kind==='content')&&Array.isArray(input.content)&&input.content.length)fail('content');
 if(!content.length&&(t.nodeModelVersion!==12||!t.sections.some(s=>s.source.kind==='authored')))issues.push(issue('EMPTY_CONTENT','content','No accepted content'));
 if(issues.length)return {ok:false,issues,warnings};
 const value:PreparedInput={schemaVersion:1,template:{templateId:t.templateId,docKey:t.docKey,version:t.version,fingerprint},data,content,originalContentCount:input.content.length,skippedContentIndices,warnings:structuredClone(warnings)};
 return {ok:true,value,warnings};
}
