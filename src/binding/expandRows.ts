import type {Format} from '../template/types.js';
import type {PreparedData,PreparedItem} from '../data/types.js';
import type {DocumentNode,SourceEntry} from '../composition/resolvedDocument.js';
import {bindInlines,resolveScalar} from './bindInlines.js';
// Clone only reachable subtrees. A repeated row replaces its source row; no
// template descendants survive when its collection is empty.
export function expandRows(format:Format,global:PreparedData,local:PreparedData,contentIndex:number,formatKey:string,nodes:Record<string,DocumentNode>,sourceMap:Record<string,SourceEntry>):string[]{
 const prefix=`content-${contentIndex}~`,origin={contentIndex,format:formatKey};
 const repeats=new Map(format.repeats.map(r=>[r.rowTemplateId,r]));
 const cellRepeats=new Map((format.cellRepeats??[]).map(r=>[r.cellId,r]));
 const clone=(sourceId:string,itemIndex?:number,item:PreparedItem={},repeatId?:string):string=>{
  const instancePrefix=prefix+(repeatId===undefined?'':`repeat-${repeatId}~`),instanceOrigin={...origin,...repeatId===undefined?{}:{repeatId}};
  const source=format.fragment.nodes[sourceId]!;
  const id=instancePrefix+sourceId+(itemIndex===undefined?'':`~item-${itemIndex}`);
  sourceMap[id]={...instanceOrigin,sourceId,...itemIndex===undefined?{}:{itemIndex}};
  if(source.type==='text-block')nodes[id]={...structuredClone(source),id,props:{...structuredClone(source.props),...(source.props.anchorId===undefined?{}:{anchorId:resolveScalar(source.props.anchorId,{global,local,item})})} as import('../composition/resolvedDocument.js').TextBlock['props'],children:bindInlines(source.children,{global,local,item},instancePrefix,itemIndex,instanceOrigin,sourceMap)};
  else if(source.type==='table-of-contents')nodes[id]={...structuredClone(source),id};
  else if(source.type==='image'){const scope=source.props.source.scope==='global'?global:source.props.source.scope==='local'?local:item;nodes[id]={id,type:'image',props:{width:structuredClone(source.props.width),height:structuredClone(source.props.height),...(source.props.align===undefined?{}:{align:source.props.align}),resourceId:scope[source.props.source.key] as string}};}
  else if(source.type==='table'){
   const rowIds:string[]=[];
   for(const rid of source.rowIds){const repeat=repeats.get(rid);
    if(!repeat)rowIds.push(clone(rid));else{
     const items=(repeat.source.scope==='global'?global:local)[repeat.source.key] as PreparedItem[];
     items.forEach((value,i)=>rowIds.push(clone(rid,i,value)));
    }
   }
   nodes[id]={...structuredClone(source),id,rowIds};
  }else if(source.type==='table-row')nodes[id]={...structuredClone(source),id,cellIds:source.cellIds.map(cid=>clone(cid,itemIndex,item,repeatId))};
  else {
   const repeat=cellRepeats.get(sourceId),childIds:string[]=[];
   for(let c=0;c<source.childIds.length;c++){
    const cid=source.childIds[c]!;
    if(!repeat||cid!==repeat.childTemplateIds[0])childIds.push(clone(cid,itemIndex,item,repeatId));
    else {
     const items=(repeat.source.scope==='global'?global:local)[repeat.source.key] as PreparedItem[];
     items.forEach((value,i)=>{for(const child of repeat.childTemplateIds)childIds.push(clone(child,i,value,repeat.id));});
     c+=repeat.childTemplateIds.length-1;
    }
   }
   nodes[id]={...structuredClone(source),id,childIds};
  }
  return id;
 };
 return format.fragment.rootIds.map(id=>clone(id));
}
