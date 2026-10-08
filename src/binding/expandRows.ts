import type {Format} from '../template/types.js';
import type {PreparedData} from '../data/types.js';
import type {DocumentNode,SourceEntry} from '../composition/resolvedDocument.js';
import {bindInlines} from './bindInlines.js';
// Clone only reachable subtrees. A repeated row replaces its source row; no
// template descendants survive when its collection is empty.
export function expandRows(format:Format,global:PreparedData,local:PreparedData,contentIndex:number,formatKey:string,nodes:Record<string,DocumentNode>,sourceMap:Record<string,SourceEntry>):string[]{
 const prefix=`content-${contentIndex}~`,origin={contentIndex,format:formatKey};
 const repeats=new Map(format.repeats.map(r=>[r.rowTemplateId,r]));
 const clone=(sourceId:string,itemIndex?:number,item:Record<string,string>={}):string=>{
  const source=format.fragment.nodes[sourceId]!;
  const id=prefix+sourceId+(itemIndex===undefined?'':`~item-${itemIndex}`);
  sourceMap[id]={...origin,sourceId,...itemIndex===undefined?{}:{itemIndex}};
  if(source.type==='text-block')nodes[id]={...structuredClone(source),id,children:bindInlines(source.children,{global,local,item},prefix,itemIndex,origin,sourceMap)};
  else if(source.type==='image'){const scope=source.props.source.scope==='global'?global:local;nodes[id]={id,type:'image',props:{width:structuredClone(source.props.width),height:structuredClone(source.props.height),...(source.props.align===undefined?{}:{align:source.props.align}),resourceId:scope[source.props.source.key] as string}};}
  else if(source.type==='table'){
   const rowIds:string[]=[];
   for(const rid of source.rowIds){const repeat=repeats.get(rid);
    if(!repeat)rowIds.push(clone(rid));else{
     const items=(repeat.source.scope==='global'?global:local)[repeat.source.key] as Record<string,string>[];
     items.forEach((value,i)=>rowIds.push(clone(rid,i,value)));
    }
   }
   nodes[id]={...structuredClone(source),id,rowIds};
  }else if(source.type==='table-row')nodes[id]={...structuredClone(source),id,cellIds:source.cellIds.map(cid=>clone(cid,itemIndex,item))};
  else nodes[id]={...structuredClone(source),id,childIds:source.childIds.map(cid=>clone(cid,itemIndex,item))};
  return id;
 };
 return format.fragment.rootIds.map(id=>clone(id));
}
