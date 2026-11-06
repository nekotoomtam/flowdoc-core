import {prepareAssembly} from './prepareAssembly.js';
import type {Result} from '../result.js';
import type {ValidatedTemplate,TemplateDefinition} from '../template/types.js';
import type {PreparedInput} from './types.js';
export function prepareGeneration(template:ValidatedTemplate,input:unknown):Result<PreparedInput>{return prepareWithDefinition(template.definition,template.fingerprint,input);}
export function prepareWithDefinition(t:TemplateDefinition,fingerprint:string,input:unknown):Result<PreparedInput>{
 if(t.nodeModelVersion!==20)return {ok:false,issues:[{code:'INVALID_DATA',path:'nodeModelVersion',message:'Only model20 documents are supported'}],warnings:[]};
 return prepareAssembly(t,fingerprint,input);
}
