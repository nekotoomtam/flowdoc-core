import type {Result} from '../result.js';
import {issue} from '../template/checks.js';
import {readUniqueJson} from '../json/readUniqueJson.js';
export function readGenerationJson(raw:string):Result<unknown>{try{return {ok:true,value:readUniqueJson(raw),warnings:[]};}catch{return {ok:false,issues:[issue('INVALID_DATA','request','Malformed JSON or duplicate property name')],warnings:[]};}}
