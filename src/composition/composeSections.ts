import type {TemplateDefinition} from '../template/types.js';
import type {PreparedInput} from '../data/types.js';
import type {ResolvedDocument} from './resolvedDocument.js';
import {buildAreaIndex} from '../template/areas.js';
import {expandRows} from '../binding/expandRows.js';
export function composeSections(t:Extract<TemplateDefinition,{nodeModelVersion:12|13}>,p:PreparedInput,d:ResolvedDocument):void {
 const areaIndex=buildAreaIndex(t);d.sections=[];
 for(const s of t.sections){
  const sectionId=s.id,prefix=`section-${sectionId}~`,pageLayoutId=s.pageLayoutId??t.book.defaultPageLayoutId;
  const rootIds=s.source.kind==='blank'?[]:s.source.kind==='content'?p.content.flatMap(e=>expandRows(t.formats[e.format]!,p.data,e.data,e.originalIndex,e.format,d.nodes,d.sourceMap,{areaIndex,prefix:prefix+`content-${e.originalIndex}~`,origin:{origin:'content',sectionId,contentIndex:e.originalIndex,format:e.format}})):
   expandRows({...s.source,inputSchema:{type:'object',fields:{}}},p.data,{},undefined,undefined,d.nodes,d.sourceMap,{areaIndex,prefix,origin:{origin:'authored',sectionId}});
  d.sections.push({...(t.nodeModelVersion===13?{role:s.role??'body',sourceKind:s.source.kind}:{}),sectionId,pageLayoutId,page:structuredClone(t.pageLayouts[pageLayoutId]!.page),rootIds});
  d.rootIds.push(...rootIds);
 }
}
