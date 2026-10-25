import {object,keys,name} from '../template/checks.js';
import type {ResolvedDocument} from './resolvedDocument.js';
/** A renderer must not accept a caller-created suffix that steals unrelated roots. */
export function validEndingArea(s:any,d:Pick<ResolvedDocument,'sourceMap'|'nodes'|'formatInstances'>):boolean {
 const a=s.endingArea;if(a===undefined)return true;
 if(!object(a)||!keys(a,['areaId','verticalAlign','rootStartIndex','rootIds'])||!name(a.areaId)||a.areaId.includes('~')||a.verticalAlign!=='bottom'||s.role!=='body'||s.sourceKind!=='authored'||!Number.isSafeInteger(a.rootStartIndex)||a.rootStartIndex<0||a.rootStartIndex>s.rootIds.length||!Array.isArray(a.rootIds))return false;
 if(JSON.stringify(s.rootIds.slice(a.rootStartIndex))!==JSON.stringify(a.rootIds))return false;
 const owned=s.rootIds.filter((id:string)=>d.sourceMap[id]?.areaId===a.areaId);
 if(JSON.stringify(owned)!==JSON.stringify(a.rootIds))return false;
 if(a.rootIds.some((id:string)=>!d.nodes[id]||d.sourceMap[id]?.sectionId!==s.sectionId||['page-break','table-of-contents'].includes(d.nodes[id]!.type)))return false;
 return !(d.formatInstances??[]).some(f=>f.sectionId===s.sectionId&&f.areaId===a.areaId&&f.sizing.mode!=='auto');
}
