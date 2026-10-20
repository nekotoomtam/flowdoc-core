import type {AreaIndex} from '../template/areas.js';
import type {PreparedData,PreparedAreaValue} from '../data/types.js';
import type {DocumentNode,SourceEntry,SourceOrigin} from '../composition/resolvedDocument.js';
export interface AreaExpansionContext {access?:import('../template/taskAccess.js').TemplateAccess|undefined;formatInstances?:import('../composition/resolvedDocument.js').FormatInstance[]|undefined;rootOffset?:number|undefined;budget?:import('./expansionBudget.js').ExpansionBudget|undefined;scopes?:Partial<import('./bindInlines.js').BindingScopes>|undefined;index:AreaIndex;areaId:string;global:PreparedData;local:PreparedData;contentIndex:number|undefined;formatKey:string|undefined;prefix?:string;origin?:SourceOrigin|undefined;nodes:Record<string,DocumentNode>;sourceMap:Record<string,SourceEntry>}
import {driveMemory,expandAreaSteps} from './expansionSteps.js';
export function expandArea(c:AreaExpansionContext):string[]{return driveMemory(expandAreaSteps(c));}
