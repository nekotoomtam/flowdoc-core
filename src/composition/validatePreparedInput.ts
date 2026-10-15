import {validatePreparedSections} from '../data/prepareSections.js';
import type {Result} from '../result.js';
import type {ValidatedTemplate} from '../template/types.js';
import type {PreparedInput} from '../data/types.js';
export function validatePreparedInput(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{
 const checked=checkPreparedInput(template,input);
 return checked.ok?{ok:true,value:structuredClone(checked.value),warnings:structuredClone(checked.warnings)}:checked;
}
export function checkPreparedInput(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{
 if(template.definition.nodeModelVersion!==18)return {ok:false,issues:[{code:'INVALID_DATA',path:'nodeModelVersion',message:'Only Area18 documents are supported'}],warnings:[]};
 return validatePreparedSections(template,input);
}
