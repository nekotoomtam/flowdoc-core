import type {Issue} from '../result.js';
import type {ObjectSchema,StringField,ArrayField,ImageField,LinkField} from './types.js';
import {object,keys,own,name,issue} from './checks.js';
import {validateField} from '../data/validateValues.js';
export function validateSchemas(input:unknown,path:string,issues:Issue[],item=false,images=false,links=false):input is ObjectSchema {
 const start=issues.length,fail=(p:string)=>issues.push(issue('INVALID_TEMPLATE',p));
 if(!object(input)||!keys(input,['type','fields'])||input.type!=='object'||!object(input.fields)){fail(path);return false;}
 for(const [key,f] of Object.entries(input.fields)){
  const p=path+'.fields.'+key,before=issues.length;
  if(!name(key)||key.includes('.')||!object(f)){fail(p);continue;}
  if(!keys(f,(f.type==='image'||f.type==='link')?['type','required','default','label','description']:f.type==='string'?['type','required','default','allowEmpty','label','description']:['type','required','default','items','label','description']))fail(p);
  for(const k of ['required','allowEmpty'])if(own(f,k)&&typeof f[k]!=='boolean')fail(p+'.'+k);
  for(const k of ['label','description'])if(own(f,k)&&typeof f[k]!=='string')fail(p+'.'+k);
  if(f.type==='array'&&!item)validateSchemas(f.items,p+'.items',issues,true,images,links);
  else if(f.type!=='string'&&!(f.type==='image'&&images&&!item)&&!(f.type==='link'&&links))fail(p+'.type');
  if(issues.length===before&&own(f,'default')){
   const errors:Issue[]=[],warnings:Issue[]=[];validateField(f as StringField|ArrayField|ImageField|LinkField,f.default,p+'.default',errors,warnings);
   issues.push(...[...errors,...warnings].map(e=>({...e,code:'INVALID_TEMPLATE'})));
  }
 }
 return issues.length===start;
}
