import type {TextRuntime} from '../layout/textFlow.js';
/** Per-generation LRU; limits retained UTF-16 payload bytes and entry count. */
export function cacheTextRuntime(base:TextRuntime,limits={maxBytes:8*1024*1024,maxEntries:8192}):TextRuntime&{dispose():void}{
 const entries=new Map<string,string>();let bytes=0,disposed=false;
 async function get<T>(key:string,load:()=>Promise<T>):Promise<T>{
  if(disposed)return load();
  const hit=entries.get(key);
  if(hit!==undefined){entries.delete(key);entries.set(key,hit);return JSON.parse(hit) as T;}
  const result=await load(),value=JSON.stringify(result),size=2*(key.length+value.length);
  if(!disposed&&size<=limits.maxBytes&&limits.maxEntries>0){
   while(entries.size&&(bytes+size>limits.maxBytes||entries.size>=limits.maxEntries)){
    const oldest=entries.keys().next().value!;bytes-=2*(oldest.length+entries.get(oldest)!.length);entries.delete(oldest);
   }
   // Concurrent identical misses must not count one key twice.
   const previous=entries.get(key);if(previous!==undefined){bytes-=2*(key.length+previous.length);entries.delete(key);}
   entries.set(key,value);bytes+=size;
  }
  return result;
 }
 return {...(base.fontId?{fontId:(style:Parameters<NonNullable<TextRuntime['fontId']>>[0])=>base.fontId!(style)}:{}),dispose(){disposed=true;entries.clear();bytes=0;},breaks:text=>get(JSON.stringify(['breaks',text]),()=>base.breaks(text)),shape:(text,font,size)=>get(JSON.stringify(['shape',font,size,text]),()=>base.shape(text,font,size))};
}
