import type {TemplateDefinition,AreaField,AreaFormat} from './types.js';
export interface AreaDefinition {scope:'global'|'section';sectionId?:string|undefined;key:string;field:AreaField;formatsByKey:Map<string,{id:string;format:AreaFormat}>}
export interface AreaIndex {byId:Map<string,AreaDefinition>}
export function buildAreaIndex(t:TemplateDefinition):AreaIndex {
 const byId=new Map<string,AreaDefinition>();
 const add=(fields:Record<string,any>,scope:'global'|'section',sectionId?:string)=>{for(const [key,field] of Object.entries(fields))if(field.type==='area')byId.set(field.areaId,{scope,sectionId,key,field,formatsByKey:new Map()});};
 add(t.globalSchema.fields,'global');
 for(const section of t.sections)add(section.inputSchema.fields,'section',section.id);
 for(const [id,f] of Object.entries(t.areaFormats??{}))byId.get(f.ownerAreaId)?.formatsByKey.set(f.key,{id,format:f});
 return {byId};
}
