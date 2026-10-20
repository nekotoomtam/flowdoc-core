import type {ExpansionBudget} from './expansionBudget.js';
import type {AreaIndex} from '../template/areas.js';
export interface ExpansionOptions {access?:import('../template/taskAccess.js').TemplateAccess|undefined;formatInstances?:import('../composition/resolvedDocument.js').FormatInstance[]|undefined;rootOffset?:number|undefined;budget?:ExpansionBudget|undefined;scopes?:Partial<import('./bindInlines.js').BindingScopes>|undefined;origin?:SourceOrigin|undefined;areaIndex?:AreaIndex;prefix?:string;areaOrigin?:{areaId:string;areaEntryIndex:number;areaFormatId:string}}
import type {Format} from '../template/types.js';
import type {PreparedData,PreparedItem} from '../data/types.js';
import type {DocumentNode,SourceEntry,SourceOrigin} from '../composition/resolvedDocument.js';
// Both legacy and task composition drive the same binding expansion steps.
import {driveMemory,expandRowsSteps} from './expansionSteps.js';
export function expandRows(format:Format,global:PreparedData,local:PreparedData,contentIndex:number|undefined,formatKey:string|undefined,nodes:Record<string,DocumentNode>,sourceMap:Record<string,SourceEntry>,options:ExpansionOptions={}):string[]{
 return driveMemory(expandRowsSteps(format,global,local,contentIndex,formatKey,nodes,sourceMap,options));
}
