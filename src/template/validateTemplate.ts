import {validateOwnedTemplate} from './sectionOwnership.js';
import type {Result} from '../result.js';
import type {ValidatedTemplate} from './types.js';
import {readTemplateJson} from './readTemplateJson.js';
import {isJson,object,issue} from './checks.js';
export function validateTemplate(input:unknown):Result<ValidatedTemplate>{
 try {
  if(typeof input==='string'){const parsed=readTemplateJson(input);if(!parsed.ok)return parsed;input=parsed.value;}
  if(!isJson(input)||!object(input)||input.nodeModelVersion!==18)return {ok:false,issues:[issue('INVALID_TEMPLATE','nodeModelVersion','Only Area18 documents are supported')],warnings:[]};
  return validateOwnedTemplate(input);
 }catch{return {ok:false,issues:[issue('INVALID_TEMPLATE','template')],warnings:[]};}
}
