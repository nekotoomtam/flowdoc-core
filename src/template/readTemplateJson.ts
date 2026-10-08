import type {Result} from '../result.js';
import {issue} from './checks.js';
// JSON.parse owns syntax validation. A second token walk detects duplicate decoded
// keys before the parsed value is allowed into registration.
export function readTemplateJson(raw:string):Result<unknown>{
 try {
  const parsed:unknown=JSON.parse(raw);let i=0;
  const ws=()=>{while(/\s/.test(raw[i]??'')&&i<raw.length)i++;};
  const string=()=>{const start=i++;while(i<raw.length){const c=raw[i++];if(c==='\\')i++;else if(c==='"')break;}return JSON.parse(raw.slice(start,i)) as string;};
  const walk=()=>{ws();const c=raw[i];if(c==='"'){string();return;}
   if(c==='{'||c==='['){const end=c==='{'?'}':']',seen=new Set<string>();i++;ws();if(raw[i]===end){i++;return;}
    for(;;){ws();if(c==='{'){const k=string();if(seen.has(k))throw Error('Duplicate key');seen.add(k);ws();i++;}walk();ws();if(raw[i++]===end)return;}
   }
   while(i<raw.length&&!/[\s,\]}]/.test(raw[i]!))i++;
  };walk();return {ok:true,value:parsed,warnings:[]};
 }catch{return {ok:false,issues:[issue('INVALID_TEMPLATE','template','Malformed JSON or duplicate property name')],warnings:[]};}
}
