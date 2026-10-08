import type {TextInline,SourceEntry} from '../composition/resolvedDocument.js';
import type {FieldRef} from '../template/types.js';
import type {PreparedData} from '../data/types.js';
export interface BindingScopes {global:PreparedData;local:PreparedData;item:Record<string,string>}
export function bindInlines(children:(TextInline|FieldRef)[],scopes:BindingScopes,prefix:string,itemIndex:number|undefined,origin:Omit<SourceEntry,'sourceId'|'itemIndex'>,sourceMap:Record<string,SourceEntry>):TextInline[]{
 const out:TextInline[]=[];
 for(const child of children){
  const base=prefix+child.id+(itemIndex===undefined?'':`~item-${itemIndex}`);
  const source:SourceEntry={...origin,sourceId:child.id,...itemIndex===undefined?{}:{itemIndex}};
  const add=(leaf:TextInline)=>{out.push(leaf);sourceMap[leaf.id]={...source};};
  if(child.type==='line-break'){add({id:base,type:'line-break'});continue;}
  const value=child.type==='text'?child.text:scopes[child.scope][child.key] as string;
  const parts=value.replace(/\r\n?/g,'\n').split('\n');let serial=0;
  const expanded=child.type==='field-ref'||parts.length>1;
  for(const [i,part] of parts.entries()){
   if(i>0)add({id:base+`~part-${serial++}`,type:'line-break'});
   if(part)add({id:base+(expanded?`~part-${serial++}`:''),type:'text',text:part});
  }
 }
 return out;
}
