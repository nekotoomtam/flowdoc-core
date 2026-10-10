import type {AreaIndex} from '../template/areas.js';
import type {PreparedData,PreparedAreaValue} from '../data/types.js';
import type {DocumentNode,SourceEntry,SourceOrigin} from '../composition/resolvedDocument.js';
import {expandRows} from './expandRows.js';
export interface AreaExpansionContext {scopes?:Partial<import('./bindInlines.js').BindingScopes>|undefined;index:AreaIndex;areaId:string;global:PreparedData;local:PreparedData;contentIndex:number|undefined;formatKey:string|undefined;prefix?:string;origin?:SourceOrigin|undefined;nodes:Record<string,DocumentNode>;sourceMap:Record<string,SourceEntry>}
export function expandArea(c:AreaExpansionContext):string[]{
 const a=c.index.byId.get(c.areaId)!,value=(a.scope==='global'?c.global:a.scope==='section'?c.scopes!.section!:c.local)[a.key] as PreparedAreaValue;
 return value.entries.flatMap(e=>{const f=a.formatsByKey.get(e.format)!;
  return expandRows(f.format,c.global,e.data,c.contentIndex,c.formatKey,c.nodes,c.sourceMap,{origin:c.origin,scopes:c.scopes,prefix:`${c.prefix??`content-${c.contentIndex}~`}area-${c.areaId}~entry-${e.originalIndex}~format-${f.id}~`,areaOrigin:{areaId:c.areaId,areaEntryIndex:e.originalIndex,areaFormatId:f.id}});
 });
}
