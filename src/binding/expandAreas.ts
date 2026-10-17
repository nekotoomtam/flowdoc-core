import type {AreaIndex} from '../template/areas.js';
import type {PreparedData,PreparedAreaValue} from '../data/types.js';
import type {DocumentNode,SourceEntry,SourceOrigin} from '../composition/resolvedDocument.js';
import {expandRows} from './expandRows.js';
export interface AreaExpansionContext {formatInstances?:import('../composition/resolvedDocument.js').FormatInstance[]|undefined;rootOffset?:number|undefined;budget?:import('./expansionBudget.js').ExpansionBudget|undefined;scopes?:Partial<import('./bindInlines.js').BindingScopes>|undefined;index:AreaIndex;areaId:string;global:PreparedData;local:PreparedData;contentIndex:number|undefined;formatKey:string|undefined;prefix?:string;origin?:SourceOrigin|undefined;nodes:Record<string,DocumentNode>;sourceMap:Record<string,SourceEntry>}
export function expandArea(c:AreaExpansionContext):string[]{
 const a=c.index.byId.get(c.areaId)!,value=(a.scope==='global'?c.global:c.scopes!.section!)[a.key] as PreparedAreaValue;
 const result:string[]=[];
 for(const e of value.entries){const f=a.formatsByKey.get(e.format)!;
  const roots=expandRows(f.format,c.global,e.data,c.contentIndex,c.formatKey,c.nodes,c.sourceMap,{budget:c.budget,origin:c.origin,scopes:c.scopes,prefix:`${c.prefix??`content-${c.contentIndex}~`}area-${c.areaId}~entry-${e.originalIndex}~format-${f.id}~`,areaOrigin:{areaId:c.areaId,areaEntryIndex:e.originalIndex,areaFormatId:f.id}});
  if(f.format.sizing)c.formatInstances?.push({sectionId:c.origin!.sectionId!,areaId:c.areaId,areaEntryIndex:e.originalIndex,areaFormatId:f.id,format:e.format,sizing:structuredClone(f.format.sizing),rootIds:roots,...(c.rootOffset===undefined?{}:{rootStartIndex:c.rootOffset+result.length})});
  result.push(...roots);
 }
 return result;
}
