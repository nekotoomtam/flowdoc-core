import type {FormatInstance,ResolvedDocument} from '../composition/resolvedDocument.js';
import type {Issue} from '../result.js';
export interface FormatCursor {kind:'text'|'image'|'node';nodeId:string;sourceNodeId:string;lineIndex?:number;sourceOffset?:number;nodeType?:string;tableId?:string;rowId?:string;cellId?:string;groupId?:string;groupIndex?:number;itemIndex?:number;repeatId?:string}
export type FormatReason='height-limit'|'image-does-not-fit'|'unbreakable-item-does-not-fit'|'explicit-page-break';
export class FormatStop extends Error {constructor(readonly reason:FormatReason,readonly pending:FormatCursor[],readonly completedNodeIds:string[]=[]){super(reason);}}
export function formatCursor(d:ResolvedDocument,nodeId:string,kind:FormatCursor['kind'],extra:Partial<FormatCursor>={}):FormatCursor {
 const s=d.sourceMap[nodeId];return {kind,nodeId,sourceNodeId:s?.sourceId??nodeId,...(s?.groupId?{groupId:s.groupId,groupIndex:s.groupIndex!}:{}),...(s?.itemIndex===undefined?{}:{itemIndex:s.itemIndex}),...(s?.repeatId?{repeatId:s.repeatId}:{}),...extra};
}
export function formatIdentity(f:FormatInstance){return {version:1 as const,areaId:f.areaId,areaEntryIndex:f.areaEntryIndex,areaFormatId:f.areaFormatId,format:f.format};}
export function formatWarning(f:FormatInstance,code:'FORMAT_CONTENT_OMITTED'|'FORMAT_FRAME_NOT_SHOWN'|'FORMAT_IMAGE_NOT_SHOWN',details:Record<string,unknown>):Issue {
 const base={code,path:`areaFormats.${f.areaFormatId}.sizing`,sectionId:f.sectionId,action:'skipped' as const};
 const key=code==='FORMAT_CONTENT_OMITTED'?'formatOmission':code==='FORMAT_FRAME_NOT_SHOWN'?'formatFrameOmission':'formatImageOmission';
 const message=code==='FORMAT_CONTENT_OMITTED'?'Format instance exceeded its fixed frame; remaining content was not shown':code==='FORMAT_FRAME_NOT_SHOWN'?'Format instance frame did not fit the current page and was not shown':'Image frame exceeded printable page height and was not shown';
 return {...base,message,[key]:{...formatIdentity(f),...details}};
}
export function instanceForNode(d:ResolvedDocument,id:string):FormatInstance|undefined {const s=d.sourceMap[id];return s?.areaId===undefined?undefined:d.formatInstances?.find(f=>f.sectionId===s.sectionId&&f.areaId===s.areaId&&f.areaEntryIndex===s.areaEntryIndex&&f.areaFormatId===s.areaFormatId);}
