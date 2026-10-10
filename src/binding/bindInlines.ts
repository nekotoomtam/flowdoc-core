import type {BoundLink} from '../composition/linkContract.js';
import type {TextInline,SourceEntry,SourceOrigin} from '../composition/resolvedDocument.js';
import type {TemplateInline,ScalarBinding} from '../template/types.js';
import type {PreparedData,PreparedItem} from '../data/types.js';
export interface BindingScopes {section?:PreparedData;header?:PreparedData;footer?:PreparedData;global:PreparedData;local:PreparedData;item:PreparedItem}
export const resolveScalar=(value:ScalarBinding,scopes:BindingScopes):string=>typeof value==='string'?value:scopes[value.scope]![value.key] as string;
export function bindInlines(children:TemplateInline[],scopes:BindingScopes,prefix:string,itemIndex:number|undefined,origin:SourceOrigin&Pick<SourceEntry,'repeatId'|'areaId'|'areaEntryIndex'|'areaFormatId'>,sourceMap:Record<string,SourceEntry>):TextInline[]{
 const out:TextInline[]=[];
 for(const child of children){
  const base=prefix+child.id+(itemIndex===undefined?'':`~item-${itemIndex}`);
  const source:SourceEntry={...origin,sourceId:child.id,...itemIndex===undefined?{}:{itemIndex}};
  const add=(leaf:TextInline)=>{out.push(leaf);sourceMap[leaf.id]={...source};};
  if(child.type==='line-break'){add({id:base,type:'line-break'});continue;}
  if(child.type==='url'||child.type==='link'||child.type==='reference'){
   const command=Object.fromEntries(Object.entries(child).map(([key,value])=>[key,key==='id'?base:key==='type'?value:resolveScalar(value as ScalarBinding,scopes)]));
   add(command as TextInline);continue;
  }
  const value=child.type==='text'?child.text:scopes[child.scope]![child.key];
  if(typeof value!=='string'){add({id:base,...structuredClone(value as BoundLink)});continue;}
  const parts=value.replace(/\r\n?/g,'\n').split('\n');let serial=0;
  const expanded=child.type==='field-ref'||parts.length>1;
  for(const [i,part] of parts.entries()){
   if(i>0)add({id:base+`~part-${serial++}`,type:'line-break'});
   if(part)add({id:base+(expanded?`~part-${serial++}`:''),type:'text',text:part});
  }
 }
 return out;
}
