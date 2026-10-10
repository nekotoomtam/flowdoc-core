import {composePageBand} from './composePageBand.js';
import type {TemplateDefinition} from '../template/types.js';
import type {PreparedInput} from '../data/types.js';
import type {ResolvedDocument} from './resolvedDocument.js';
import {buildAreaIndex} from '../template/areas.js';
import {expandRows} from '../binding/expandRows.js';
export function composeSections(t:Extract<TemplateDefinition,{nodeModelVersion:12|13|14|15}>,p:PreparedInput,d:ResolvedDocument):void {
 const areaIndex=buildAreaIndex(t);d.sections=[];
 for(const s of t.sections){
  const value=t.nodeModelVersion===15?p.sections![s.id]:undefined;
  const data=value?.data??p.data,content=value?.content??p.content,formats=t.nodeModelVersion===15?(s as import('../template/types.js').Section15).formats:t.formats;
  const scopes=t.nodeModelVersion===15?{section:data}:{};
  const sectionId=s.id,prefix=`section-${sectionId}~`,pageLayoutId=s.pageLayoutId??t.book.defaultPageLayoutId;
  const rootIds=s.source.kind==='blank'?[]:s.source.kind==='content'?content.flatMap(e=>expandRows(formats[e.format]!,p.data,e.data,e.originalIndex,e.format,d.nodes,d.sourceMap,{areaIndex,scopes,prefix:prefix+`content-${e.originalIndex}~`,origin:{origin:'content',sectionId,contentIndex:e.originalIndex,format:e.format}})):
   expandRows({...s.source,inputSchema:{type:'object',fields:{}}},p.data,{},undefined,undefined,d.nodes,d.sourceMap,{areaIndex,scopes,prefix,origin:{origin:'authored',sectionId}});
  d.sections.push({...(t.nodeModelVersion>=14?{headerMode:s.headerMode??'all',footerMode:s.footerMode??'all'}:{}),...(t.nodeModelVersion>=13?{role:s.role??'body',sourceKind:s.source.kind}:{}),sectionId,pageLayoutId,page:structuredClone(t.pageLayouts[pageLayoutId]!.page),rootIds});
  if(t.nodeModelVersion===15){const def=s as import('../template/types.js').Section15;for(const k of ['header','footer'] as const)if(def[k])d.sections[d.sections.length-1]![k]=composePageBand(def[k]!,value![k]!,k,{global:p.data,section:data,[k]:value![k]!},s.id);}
  d.rootIds.push(...rootIds);
 }
}
