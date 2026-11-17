import type {AreaIndex} from '../template/areas.js';
import {prepareAreaValue} from './prepareAreas.js';
import {validateLink} from '../composition/linkContract.js';
import type {Issue} from '../result.js';
import type {ObjectSchema,StringField,NumberField,ArrayField,ImageField,LinkField,AreaField} from '../template/types.js';
import type {PreparedData,PreparedItem} from './types.js';
import {object,own,text,issue} from '../template/checks.js';
import {formulaSource, NumericSum, validNumber} from './numericValues.js';
import {calculateComputedText} from './computedValues.js';
export type ValueMode='request'|'prepared';
export const actualType=(v:unknown)=>v===null?'null':Array.isArray(v)?'array':typeof v==='undefined'?'null':typeof v as 'string'|'number'|'boolean'|'object'|'array'|'null';
export function validateValues(schema:ObjectSchema,input:unknown,path:string,issues:Issue[],warnings:Issue[],mode:ValueMode='request',missing=false,areaIndex?:AreaIndex):PreparedData {
 // Prepared values are checked in place, never rewritten. The outer validator snapshots once.
 const out:PreparedData=mode==='prepared'&&object(input)?input as PreparedData:Object.create(null);
 const store=(key:string,value:PreparedData[string])=>{if(mode==='request')out[key]=value;};
 if(missing){issues.push(issue('MISSING_REQUIRED',path));}
 else if(!object(input)){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'object',actualType:actualType(input)});return out;}
 const data=missing?Object.create(null):input as Record<string,unknown>;
 for(const key of Object.keys(data))if(!own(schema.fields,key)){
  const d={...issue('UNKNOWN_VARIABLE',path+'.'+key,'Undeclared variable'),action:'ignored' as const};
  if(mode==='prepared')issues.push(issue('INVALID_DATA',d.path));else warnings.push(d);
 }
 for(const [key,field] of Object.entries(schema.fields)){
  const p=path+'.'+key;
  if(field.type==='string'&&field.computed||field.type==='number'&&field.formula)continue;
  if(field.type==='area'){if(!areaIndex)issues.push(issue('INVALID_DATA',p));else store(key,prepareAreaValue(areaIndex,field.areaId,data[key],p,issues,warnings,!own(data,key),mode));continue;}
  if(!own(data,key)){
   if(mode==='prepared'||field.required){issues.push(issue(mode==='prepared'?'INVALID_DATA':'MISSING_REQUIRED',p));continue;}
   if(own(field,'default'))store(key,validateField(field,structuredClone(field.default),p,issues,warnings,mode));
   else store(key,field.type==='array'?[]:field.type==='number'?0:'');
  }else store(key,validateField(field,data[key],p,issues,warnings,mode));
 }
 for(const [key,field] of Object.entries(schema.fields)){
  if(field.type==='number'&&field.formula){
   const p=path+'.'+key, source=areaIndex&&formulaSource(field.formula,schema,areaIndex);
   if(mode==='request'&&own(data,key)){issues.push(issue('INVALID_DATA',p,'Formula variable is read-only'));continue;}
   const area:unknown=source&&out[source.area.key];
   if(!source||!object(area)||area.kind!=='area'||!Array.isArray(area.entries)){issues.push(issue('INVALID_DATA',p));continue;}
   const sum=new NumericSum();
   for(const entry of area.entries){
    if(entry?.format!==source.formatKey)continue;
    const rows=entry.data?.[source.arrayField];
    if(!Array.isArray(rows))continue; // Source validation reports malformed prepared rows.
    for(const row of rows){const value=row?.[source.valueField];if(validNumber(value))sum.add(value);}
   }
   const result=sum.value();
   if(!validNumber(result)||mode==='prepared'&&(!own(data,key)||data[key]!==result))issues.push(issue('INVALID_DATA',p));
   else store(key,result);
   continue;
  }
  if(field.type!=='string'||!field.computed)continue;
  const p=path+'.'+key,{quantity,unit}=field.computed.inputs;
  if(mode==='request'&&own(data,key)){issues.push(issue('INVALID_DATA',p,'Computed variable is read-only'));continue;}
  const result=calculateComputedText(out[quantity],out[unit]);
  if(result===undefined){issues.push(issue('INVALID_DATA',path+'.'+quantity,'Enter a non-negative whole package quantity'));continue;}
  if(mode==='prepared'&&(!own(data,key)||data[key]!==result))issues.push(issue('INVALID_DATA',p));
  else store(key,result);
 }
 return out;
}
export function validateField(field:StringField|NumberField|ArrayField|ImageField|LinkField|AreaField,value:unknown,path:string,issues:Issue[],warnings:Issue[],mode:ValueMode='request'):PreparedData[string] {
 if(field.type==='area'){issues.push(issue('INVALID_DATA',path));return [];}
 if(field.type==='link'){
  if(mode==='prepared'&&value===''&&!field.required&&!own(field,'default'))return '';
  if(!validateLink(value)){issues.push(issue('INVALID_DATA',path));return '';}
  return mode==='prepared'?value:structuredClone(value);
 }
 if(field.type==='image'){
  if(typeof value!=='string'){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'image',actualType:actualType(value)});return '';}
  if(!(value===''&&!field.required)&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))issues.push(issue('INVALID_DATA',path));
  return value;
 }
 if(field.type==='number'){
  if(!validNumber(value)){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'number',actualType:actualType(value)});return 0;}
  return value;
 }
 if(field.type==='string'){
  if(typeof value!=='string'){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'string',actualType:actualType(value)});return '';}
  const canonicalEmpty=mode==='prepared'&&!field.required&&!own(field,'default')&&value==='';
  if(!text(value)||field.allowEmpty===false&&!value.trim()&&!canonicalEmpty)issues.push(issue('INVALID_DATA',path));
  return value;
 }
 if(!Array.isArray(value)){issues.push({...issue('TYPE_MISMATCH',path),expectedType:'array',actualType:actualType(value)});return [];}
 if(mode==='prepared'){value.forEach((item,index)=>validateValues(field.items,item,`${path}[${index}]`,issues,warnings,mode));return value;}
 return value.map((item,index)=>validateValues(field.items,item,`${path}[${index}]`,issues,warnings,mode) as PreparedItem);
}
