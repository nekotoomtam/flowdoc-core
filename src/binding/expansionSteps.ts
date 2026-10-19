import {bindInlines,resolveScalar} from './bindInlines.js';
import type {Format} from '../template/types.js';
import type {DocumentNode,SourceEntry} from '../composition/resolvedDocument.js';
import type {ExpansionOptions} from './expandRows.js';
import type {AreaExpansionContext} from './expandAreas.js';
export type BindingEffect={kind:'scalars';source:any;scopes:any}|{kind:'collection';scope:any;key:string}|{kind:'next';iterator:any}|{kind:'area';scope:any;key:string};
type Steps<T>=Generator<BindingEffect,T,any>;
function* each(scope:any,key:string,visit:(value:any,index:number)=>Steps<void>):Steps<number>{
 const iterator=yield {kind:'collection',scope,key};let index=0;
 for(;;){const next=yield {kind:'next',iterator};if(next.done)break;yield*visit(next.value,index++);}return index;
}
// The binding algorithm is shared. Drivers supply either legacy in-memory
// collections or replayable bounded task handles; neither driver clones graphs.
export function* expandRowsSteps(format:Format,global:any,local:any,contentIndex:number|undefined,formatKey:string|undefined,nodes:Record<string,DocumentNode>,sourceMap:Record<string,SourceEntry>,options:ExpansionOptions={}):Steps<string[]>{
 if(options.origin?.origin!=='authored')throw Error('Missing authored Section origin');
 const prefix=options.prefix??`section-${options.origin.sectionId}~`,origin={...options.origin,...options.areaOrigin};
 const repeats=new Map(format.repeats.map(r=>[r.rowTemplateId,r])),cellRepeats=new Map((format.cellRepeats??[]).map(r=>[r.cellId,r])),groupStarts=new Map((format.rowGroups??[]).map(g=>[g.rowTemplateIds[0]!,g]));
 type Group={groupId:string;groupIndex:number;data:any;labelCellTemplateId?:string|undefined};
 function* clone(sourceId:string,itemIndex?:number,item:any={},repeatId?:string,group?:Group):Steps<string>{
  options.budget?.take();const source=format.fragment.nodes[sourceId]!;
  const rawScopes={...options.scopes,global,local,item,...group?{group:group.data}:{}},scopes=yield {kind:'scalars',source,scopes:rawScopes};
  const instancePrefix=prefix+(group?`group-${group.groupId}~index-${group.groupIndex}~`:'')+(repeatId===undefined?'':`repeat-${repeatId}~`),instanceOrigin={...origin,...repeatId===undefined?{}:{repeatId},...group?{groupId:group.groupId,groupIndex:group.groupIndex}:{}};
  const id=instancePrefix+sourceId+(itemIndex===undefined?'':`~item-${itemIndex}`);sourceMap[id]={...instanceOrigin,sourceId,...itemIndex===undefined?{}:{itemIndex}};
  if(source.type==='text-block')nodes[id]={...structuredClone(source),id,props:{...structuredClone(source.props),...(source.props.anchorId===undefined?{}:{anchorId:resolveScalar(source.props.anchorId,scopes)})} as any,children:bindInlines(source.children,scopes,instancePrefix,itemIndex,instanceOrigin,sourceMap,options.budget)};
  else if(source.type==='page-break'||source.type==='table-of-contents'||source.type==='line')nodes[id]={...structuredClone(source),id};
  else if(source.type==='image')nodes[id]={id,type:'image',props:{width:structuredClone(source.props.width),height:structuredClone(source.props.height),...(source.props.align===undefined?{}:{align:source.props.align}),resourceId:scopes[source.props.source.scope]![source.props.source.key]}};
  else if(source.type==='table'){
   const rowIds:string[]=[],groups:import('../composition/resolvedDocument.js').ResolvedRowGroup[]=[];
   for(let ri=0;ri<source.rowIds.length;ri++){
    const rid=source.rowIds[ri]!,declaration=groupStarts.get(rid),repeat=repeats.get(rid);
    if(declaration){
     yield*each(rawScopes[declaration.source.scope],declaration.source.key,function*(data,groupIndex){
      const context={groupId:declaration.id,groupIndex,data,labelCellTemplateId:declaration.groupLabel?.cellTemplateId},prefixRowIds:string[]=[];
      for(const row of declaration.rowTemplateIds.slice(0,-2))prefixRowIds.push(yield*clone(row,undefined,{},undefined,context));
      const memberIds:string[]=[];const memberCount=yield*each(data,declaration.memberRepeat.source.key,function*(value,i){memberIds.push(yield*clone(declaration.memberRepeat.rowTemplateId,i,value,undefined,context));});
      if(!memberCount)memberIds.push(yield*clone(declaration.memberRepeat.emptyRowTemplateId,undefined,{},undefined,context));
      let groupLabel:import('../composition/resolvedDocument.js').ResolvedGroupLabel|undefined;
      if(declaration.groupLabel){
       const first=nodes[memberIds[0]!] as import('../composition/resolvedDocument.js').TableRow,sourceCellId=memberCount?declaration.groupLabel.cellTemplateId:declaration.groupLabel.emptyCellTemplateId;let cellId:string;
       if(memberCount){cellId=yield*clone(sourceCellId,undefined,{},undefined,context);const row=format.fragment.nodes[declaration.memberRepeat.rowTemplateId] as import('../composition/resolvedDocument.js').TableRow;first.cellIds.splice(row.cellIds.indexOf(sourceCellId),0,cellId);}
       else cellId=first.cellIds.find(id=>sourceMap[id]!.sourceId===sourceCellId)!;
       (nodes[cellId] as import('../composition/resolvedDocument.js').TableCell).props.rowSpan=Math.max(1,memberCount);groupLabel={cellId,sourceCellId,memberCount};
      }
      const expanded=[...prefixRowIds,...memberIds];for(const row of expanded)rowIds.push(row);
      groups.push({groupId:declaration.id,groupIndex,rowIds:expanded,prefixRowIds,firstMemberRowId:memberIds[0]!,empty:memberCount===0,keepStart:declaration.pagination?.keepStart??!!declaration.groupLabel,...groupLabel?{groupLabel}:{}});
     });ri+=declaration.rowTemplateIds.length-1;
    }else if(!repeat)rowIds.push(yield*clone(rid));
    else yield*each(rawScopes[repeat.source.scope],repeat.source.key,function*(value,i){rowIds.push(yield*clone(rid,i,value));});
   }
   nodes[id]={...structuredClone(source),id,rowIds,...groups.length?{rowGroups:groups}:{}};
  }else if(source.type==='table-row'){
   const cellIds:string[]=[];for(const cid of source.cellIds.filter(cid=>!(itemIndex!==undefined&&cid===group?.labelCellTemplateId)))cellIds.push(yield*clone(cid,itemIndex,item,repeatId,group));nodes[id]={...structuredClone(source),id,cellIds};
  }else if(source.type==='area')throw Error('Area must expand as a child sequence');
  else{
   const repeat=cellRepeats.get(sourceId),childIds:string[]=[];
   for(let c=0;c<source.childIds.length;c++){
    const cid=source.childIds[c]!;
    if(!repeat||cid!==repeat.childTemplateIds[0])childIds.push(...yield*children(cid,itemIndex,item,repeatId,group));
    else{yield*each(rawScopes[repeat.source.scope],repeat.source.key,function*(value,i){for(const child of repeat.childTemplateIds)childIds.push(yield*clone(child,i,value,repeat.id));});c+=repeat.childTemplateIds.length-1;}
   }nodes[id]={...structuredClone(source),id,childIds};
  }return id;
 }
 function* children(id:string,itemIndex?:number,item:any={},repeatId?:string,group?:Group,rootOffset?:number):Steps<string[]>{
  const n=format.fragment.nodes[id]!;if(n.type!=='area')return [yield*clone(id,itemIndex,item,repeatId,group)];if(!options.areaIndex)throw Error('Missing area index');
  return yield*expandAreaSteps({formatInstances:options.formatInstances,rootOffset,budget:options.budget,index:options.areaIndex,areaId:n.props.areaId,global,local,scopes:options.scopes,contentIndex,formatKey,nodes,sourceMap,prefix,origin:options.origin});
 }
 const result:string[]=[];for(const id of format.fragment.rootIds)result.push(...yield*children(id,undefined,{},undefined,undefined,options.rootOffset===undefined?undefined:options.rootOffset+result.length));return result;
}
export function* expandAreaSteps(c:AreaExpansionContext):Steps<string[]>{
 const a=c.index.byId.get(c.areaId)!,scope=a.scope==='global'?c.global:c.scopes!.section!,iterator=yield {kind:'area',scope,key:a.key},result:string[]=[];
 for(;;){const next=yield {kind:'next',iterator};if(next.done)break;const e=next.value,f=a.formatsByKey.get(e.format)!;
  const roots=yield*expandRowsSteps(f.format,c.global,e.data,c.contentIndex,c.formatKey,c.nodes,c.sourceMap,{budget:c.budget,origin:c.origin,scopes:c.scopes,prefix:`${c.prefix??`content-${c.contentIndex}~`}area-${c.areaId}~entry-${e.originalIndex}~format-${f.id}~`,areaOrigin:{areaId:c.areaId,areaEntryIndex:e.originalIndex,areaFormatId:f.id}});
  if(f.format.sizing)c.formatInstances?.push({sectionId:c.origin!.sectionId!,areaId:c.areaId,areaEntryIndex:e.originalIndex,areaFormatId:f.id,format:e.format,sizing:structuredClone(f.format.sizing),rootIds:roots,...(c.rootOffset===undefined?{}:{rootStartIndex:c.rootOffset+result.length})});result.push(...roots);
 }return result;
}
export function driveMemory<T>(steps:Steps<T>):T{
 let step=steps.next();while(!step.done){const e=step.value;const answer=e.kind==='scalars'?e.scopes:e.kind==='next'?e.iterator.next():e.kind==='area'?e.scope[e.key].entries[Symbol.iterator]():e.scope[e.key][Symbol.iterator]();step=steps.next(answer);}return step.value;
}
