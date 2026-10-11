import type {ExpansionBudget} from './expansionBudget.js';
import type {AreaIndex} from '../template/areas.js';
import {expandArea} from './expandAreas.js';
export interface ExpansionOptions {budget?:ExpansionBudget|undefined;scopes?:Partial<import('./bindInlines.js').BindingScopes>|undefined;origin?:SourceOrigin|undefined;areaIndex?:AreaIndex;prefix?:string;areaOrigin?:{areaId:string;areaEntryIndex:number;areaFormatId:string}}
import type {Format} from '../template/types.js';
import type {PreparedData,PreparedItem} from '../data/types.js';
import type {DocumentNode,SourceEntry,SourceOrigin} from '../composition/resolvedDocument.js';
import {bindInlines,resolveScalar} from './bindInlines.js';
// Clone only reachable subtrees. A repeated row replaces its source row; no
// template descendants survive when its collection is empty.
export function expandRows(format:Format,global:PreparedData,local:PreparedData,contentIndex:number|undefined,formatKey:string|undefined,nodes:Record<string,DocumentNode>,sourceMap:Record<string,SourceEntry>,options:ExpansionOptions={}):string[]{
 if(!options.origin&&(contentIndex===undefined||formatKey===undefined))throw Error('Missing content origin');
 const prefix=options.prefix??`content-${contentIndex}~`,origin={...(options.origin??{contentIndex:contentIndex!,format:formatKey!}),...options.areaOrigin};
 const repeats=new Map(format.repeats.map(r=>[r.rowTemplateId,r]));
 const cellRepeats=new Map((format.cellRepeats??[]).map(r=>[r.cellId,r]));
 const groupStarts=new Map((format.rowGroups??[]).map(g=>[g.rowTemplateIds[0]!,g]));
 type GroupContext={groupId:string;groupIndex:number;data:PreparedItem};
 const clone=(sourceId:string,itemIndex?:number,item:PreparedItem={},repeatId?:string,group?:GroupContext):string=>{
  options.budget?.take();
  const scopes={...options.scopes,global,local,item,...group?{group:group.data}:{}};
  const instancePrefix=prefix+(group?`group-${group.groupId}~index-${group.groupIndex}~`:'')+(repeatId===undefined?'':`repeat-${repeatId}~`),instanceOrigin={...origin,...repeatId===undefined?{}:{repeatId},...group?{groupId:group.groupId,groupIndex:group.groupIndex}:{}};
  const source=format.fragment.nodes[sourceId]!;
  const id=instancePrefix+sourceId+(itemIndex===undefined?'':`~item-${itemIndex}`);
  sourceMap[id]={...instanceOrigin,sourceId,...itemIndex===undefined?{}:{itemIndex}};
  if(source.type==='text-block')nodes[id]={...structuredClone(source),id,props:{...structuredClone(source.props),...(source.props.anchorId===undefined?{}:{anchorId:resolveScalar(source.props.anchorId,scopes)})} as import('../composition/resolvedDocument.js').TextBlock['props'],children:bindInlines(source.children,scopes,instancePrefix,itemIndex,instanceOrigin,sourceMap,options.budget)};
  else if(source.type==='table-of-contents'||source.type==='line')nodes[id]={...structuredClone(source),id};
  else if(source.type==='image'){const scope=scopes[source.props.source.scope]!;nodes[id]={id,type:'image',props:{width:structuredClone(source.props.width),height:structuredClone(source.props.height),...(source.props.align===undefined?{}:{align:source.props.align}),resourceId:scope[source.props.source.key] as string}};}
  else if(source.type==='table'){
   const rowIds:string[]=[],groups:import('../composition/resolvedDocument.js').ResolvedRowGroup[]=[];
   for(let ri=0;ri<source.rowIds.length;ri++){
    const rid=source.rowIds[ri]!,declaration=groupStarts.get(rid),repeat=repeats.get(rid);
    if(declaration){
     const values=scopes[declaration.source.scope]![declaration.source.key] as PreparedItem[];
     values.forEach((data,groupIndex)=>{
      const context={groupId:declaration.id,groupIndex,data},prefixRowIds=declaration.rowTemplateIds.slice(0,-2).map(row=>clone(row,undefined,{},undefined,context));
      const members=data[declaration.memberRepeat.source.key] as PreparedItem[];
      const memberIds=members.length?members.map((value,i)=>clone(declaration.memberRepeat.rowTemplateId,i,value,undefined,context)):[clone(declaration.memberRepeat.emptyRowTemplateId,undefined,{},undefined,context)];
      const expanded=[...prefixRowIds,...memberIds];for(const row of expanded)rowIds.push(row);
      groups.push({groupId:declaration.id,groupIndex,rowIds:expanded,prefixRowIds,firstMemberRowId:memberIds[0]!,empty:members.length===0,keepStart:declaration.pagination?.keepStart??false});
     });
     ri+=declaration.rowTemplateIds.length-1;
    }else if(!repeat)rowIds.push(clone(rid));else{
     const items=scopes[repeat.source.scope]![repeat.source.key] as PreparedItem[];
     items.forEach((value,i)=>rowIds.push(clone(rid,i,value)));
    }
   }
   nodes[id]={...structuredClone(source),id,rowIds,...groups.length?{rowGroups:groups}:{}};
  }else if(source.type==='table-row')nodes[id]={...structuredClone(source),id,cellIds:source.cellIds.map(cid=>clone(cid,itemIndex,item,repeatId,group))};
  else if(source.type==='area')throw Error('Area must expand as a child sequence');
  else {
   const repeat=cellRepeats.get(sourceId),childIds:string[]=[];
   for(let c=0;c<source.childIds.length;c++){
    const cid=source.childIds[c]!;
    if(!repeat||cid!==repeat.childTemplateIds[0])childIds.push(...children(cid,itemIndex,item,repeatId,group));
    else {
     const items=scopes[repeat.source.scope]![repeat.source.key] as PreparedItem[];
     items.forEach((value,i)=>{for(const child of repeat.childTemplateIds)childIds.push(clone(child,i,value,repeat.id));});
     c+=repeat.childTemplateIds.length-1;
    }
   }
   nodes[id]={...structuredClone(source),id,childIds};
  }
  return id;
 };
 const children=(id:string,itemIndex?:number,item:PreparedItem={},repeatId?:string,group?:GroupContext):string[]=>{
  const n=format.fragment.nodes[id]!;if(n.type!=='area')return [clone(id,itemIndex,item,repeatId,group)];
  if(!options.areaIndex)throw Error('Missing area index');
  return expandArea({budget:options.budget,index:options.areaIndex,areaId:n.props.areaId,global,local,scopes:options.scopes,contentIndex,formatKey,nodes,sourceMap,prefix,origin:options.origin});
 };
 return format.fragment.rootIds.flatMap(id=>children(id));
}
