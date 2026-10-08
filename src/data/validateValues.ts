import type {Issue} from '../result.js';
import type {ObjectSchema,StringField,ArrayField,ImageField} from '../template/types.js';
import type {PreparedData} from './types.js';
import {object,own,text,issue} from '../template/checks.js';
export type ValueMode='request'|'prepared';
export const actualType=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v==='undefined'?'null':typeof v as 'string'|'number'|'boolean'|'object'|'array'|'null';
export function validateValues(schema:ObjectSchema,input:unknown,path:string,issues:Issue[],warnings:Issue[],mode:ValueMode='request',missing=false):PreparedData {
 const out:PreparedData=Object.create(null);
 if(missing){issues.push(issue('MISSING_REQUIRED',path));}
 else if(!object(input)){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'object',actualType:actualType(input)});return out;}
 const data=missing?Object.create(null):input as Record<string,unknown>;
 for(const key of Object.keys(data))if(!own(schema.fields,key)){
  const d={...issue('UNKNOWN_VARIABLE',path+'.'+key,'Undeclared variable'),action:'ignored' as const};
  if(mode==='prepared')issues.push(issue('INVALID_DATA',d.path));else warnings.push(d);
 }
 for(const [key,field] of Object.entries(schema.fields)){
  const p=path+'.'+key;
  if(!own(data,key)){
   if(mode==='prepared'||field.required){issues.push(issue(mode==='prepared'?'INVALID_DATA':'MISSING_REQUIRED',p));continue;}
   if(own(field,'default'))out[key]=validateField(field,structuredClone(field.default),p,issues,warnings,mode);
   else out[key]=field.type==='array'?[]:'';
  }else out[key]=validateField(field,data[key],p,issues,warnings,mode);
 }
 return out;
}
export function validateField(field:StringField|ArrayField|ImageField,value:unknown,path:string,issues:Issue[],warnings:Issue[],mode:ValueMode='request'):string|Record<string,string>[] {
 if(field.type==='image'){
  if(typeof value!=='string'){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'image',actualType:actualType(value)});return '';}
  if(!(value===''&&!field.required)&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))issues.push(issue('INVALID_DATA',path));
  return value;
 }
 if(field.type==='string'){
  if(typeof value!=='string'){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'string',actualType:actualType(value)});return '';}
  const canonicalEmpty=mode==='prepared'&&!field.required&&!own(field,'default')&&value==='';
  if(!text(value)||field.allowEmpty===false&&!value.trim()&&!canonicalEmpty)issues.push(issue('INVALID_DATA',path));
  return value;
 }
 if(!Array.isArray(value)){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'array',actualType:actualType(value)});return [];}
 return value.map((item,index)=>validateValues(field.items,item,`${path}[${index}]`,issues,warnings,mode) as Record<string,string>);
}
