import type {AreaIndex} from '../template/areas.js';
import type {Issue} from '../result.js';
import type {PreparedAreaValue} from './types.js';
import {object,keys,own,issue} from '../template/checks.js';
import {validateValues} from './validateValues.js';
export function prepareAreaValue(index:AreaIndex,areaId:string,value:unknown,path:string,issues:Issue[],warnings:Issue[],missing:boolean,mode:'request'|'prepared'='request'):PreparedAreaValue {
 const out:PreparedAreaValue={kind:'area',originalCount:0,entries:[],skippedIndices:[]},a=index.byId.get(areaId);
 const fail=(p=path)=>issues.push(issue('INVALID_DATA',p));if(!a){fail();return out;}
 if(mode==='prepared'){
  if(!object(value)||!keys(value,['kind','originalCount','entries','skippedIndices'])||value.kind!=='area'||!Number.isSafeInteger(value.originalCount)||value.originalCount<0||!Array.isArray(value.entries)||!Array.isArray(value.skippedIndices)){fail();return out;}
  const count=value.originalCount,used=new Set<number>();let prev=-1;
  const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<count;
  for(const e of value.entries){
   if(!object(e)||!keys(e,['originalIndex','format','formatId','data'])||!valid(e.originalIndex)||e.originalIndex<=prev||used.has(e.originalIndex)||typeof e.format!=='string'){fail();continue;}
   prev=e.originalIndex;used.add(prev);const sf=a.formatsByKey.get(e.format);
   if(!sf||e.formatId!==sf.id){fail();continue;}
   validateValues(sf.format.inputSchema,e.data,`${path}[${e.originalIndex}].data`,issues,[],'prepared');
  }
  prev=-1;for(const i of value.skippedIndices){if(!valid(i)||i<=prev||used.has(i))fail();else used.add(i);prev=i;}
  if(used.size!==value.originalCount)fail();return structuredClone(value) as PreparedAreaValue;
 }
 if(missing){if(a.field.required){issues.push(issue('MISSING_REQUIRED',path));return out;}value=own(a.field,'default')?structuredClone(a.field.default):[];}
 if(!Array.isArray(value)){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'array',actualType:typeof value});return out;}
 out.originalCount=value.length;
 for(const [i,e] of value.entries()){
  const p=`${path}[${i}]`,errors:Issue[]=[],warn:Issue[]=[];
  if(!object(e)||!keys(e,['format','data'])||typeof e.format!=='string'||!own(e,'data')||!object(e.data))errors.push(issue('INVALID_DATA',p));
  const sf=object(e)&&typeof e.format==='string'?a.formatsByKey.get(e.format):undefined;
  if(!errors.length&&!sf)errors.push(issue('UNKNOWN_FORMAT',p+'.format'));
  const data=!errors.length&&sf?validateValues(sf.format.inputSchema,e.data,p+'.data',errors,warn):{};
  if(errors.length){out.skippedIndices.push(i);warnings.push(...errors.map(e=>({...e,code:'AREA_ENTRY_SKIPPED',message:e.code+': '+e.message,action:'skipped' as const})));}
  else {out.entries.push({originalIndex:i,format:e.format,formatId:sf!.id,data});warnings.push(...warn);}
 }
 return out;
}
