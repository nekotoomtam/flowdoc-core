import type {Result} from '../result.js';
import {issue} from './checks.js';
import {readUniqueJson} from '../json/readUniqueJson.js';
export function readTemplateJson(raw:string):Result<unknown>{try{return {ok:true,value:readUniqueJson(raw),warnings:[]};}catch{return {ok:false,issues:[issue('INVALID_TEMPLATE','template','Malformed JSON or duplicate property name')],warnings:[]};}}
