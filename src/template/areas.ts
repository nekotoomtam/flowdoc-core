import {authoredHosts} from './pageSections.js';
import type {TemplateDefinition,AreaField,AreaFormat,Format} from './types.js';
import type {Issue} from '../result.js';
import {object,keys,name,issue,own} from './checks.js';
import {validateSchemas} from './validateSchemas.js';
import {validateGraph} from './validateGraph.js';
import {validateValues} from '../data/validateValues.js';
export interface AreaDefinition {scope:'global'|'local';hostFormat?:string;key:string;field:AreaField;formatsByKey:Map<string,{id:string;format:AreaFormat}>}
export interface AreaIndex {byId:Map<string,AreaDefinition>}
export function buildAreaIndex(t:TemplateDefinition):AreaIndex {
 const byId=new Map<string,AreaDefinition>();
 const add=(fields:Record<string,any>,scope:'global'|'local',hostFormat?:string)=>{for(const [key,field] of Object.entries(fields))if(field.type==='area')byId.set(field.areaId,{scope,...(hostFormat===undefined?{}:{hostFormat}),key,field,formatsByKey:new Map()});};
 add(t.globalSchema.fields,'global');for(const [key,f] of Object.entries(t.formats))add(f.inputSchema.fields,'local',key);
 for(const [id,f] of Object.entries(t.areaFormats??{}))byId.get(f.ownerAreaId)?.formatsByKey.set(f.key,{id,format:f});
 return {byId};
}
export function validateAreas(t:TemplateDefinition):Issue[]{
 const issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_TEMPLATE',p)),seen=new Set<string>();
 for(const schema of [t.globalSchema,...Object.values(t.formats).map(f=>f.inputSchema)])for(const field of Object.values(schema.fields))if(field.type==='area'){if(seen.has(field.areaId))fail('areaId');seen.add(field.areaId);}
 if(t.areaFormats!==undefined&&!object(t.areaFormats)){fail('areaFormats');return issues;}
 const index=buildAreaIndex(t),names=new Set<string>();
 for(const [id,f] of Object.entries(t.areaFormats??{})){
  const p='areaFormats.'+id;
  if(!name(id)||id.includes('~')||!object(f)||!keys(f,['key','ownerAreaId','label','description','inputSchema','fragment','repeats','cellRepeats'])||!name(f.key)||!name(f.ownerAreaId)){fail(p);continue;}
  for(const k of ['label','description'] as const)if(own(f,k)&&typeof f[k]!=='string')fail(p+'.'+k);
  const owner=index.byId.get(f.ownerAreaId),nk=JSON.stringify([f.ownerAreaId,f.key]);if(!owner||names.has(nk))fail(p+'.ownerAreaId');names.add(nk);
  const schemaOk=validateSchemas(f.inputSchema,p+'.inputSchema',issues,false,true,true,true,false);
  if(!Array.isArray(f.repeats)||(f.cellRepeats!==undefined&&!Array.isArray(f.cellRepeats)))fail(p+'.repeats');
  else if(schemaOk)issues.push(...validateGraph(f.fragment,{heightModes:t.nodeModelVersion===13,styles:t.styles,globalSchema:t.globalSchema,localSchema:f.inputSchema,repeats:f.repeats,images:true,merged:true,links:true,contents:true,cellContent:true,itemImages:true,cellRepeats:f.cellRepeats??[]},p+'.fragment'));
 }
 const placements=new Map<string,number>();
 for(const {host,f,authored} of [...Object.entries(t.formats).map(([host,f])=>({host,f,authored:false})),...authoredHosts(t).map(([host,f])=>({host,f,authored:true}))]){
  const nodes=f.fragment.nodes as Record<string,any>;
  for(const n of Object.values(nodes))if(n.type==='area'){
   const id=n.props.areaId,p='formats.'+host+'.fragment.nodes.'+n.id,owner=index.byId.get(id);placements.set(id,(placements.get(id)??0)+1);
   if(!owner||owner.scope==='local'&&(authored||owner.hostFormat!==host)){fail(p);continue;}
   const cell=Object.values(nodes).find(c=>c.type==='table-cell'&&c.childIds.includes(n.id));
   if(cell){
    const row=Object.values(nodes).find(r=>r.type==='table-row'&&r.cellIds.includes(cell.id));
    const table=Object.values(nodes).find(x=>x.type==='table'&&row&&x.rowIds.includes(row.id));
    if(!row||!table||table.rowIds.indexOf(row.id)<table.props.headerRowCount||f.repeats.some(r=>r.rowTemplateId===row.id)||(f.cellRepeats??[]).some(r=>r.childTemplateIds.includes(n.id)))fail(p);
    for(const sf of owner.formatsByKey.values())if(!object(sf.format.fragment)||!Array.isArray(sf.format.fragment.rootIds)||sf.format.fragment.rootIds.some(root=>!['text-block','image'].includes(sf.format.fragment.nodes?.[root]?.type??'')))fail(p+'.cellContent');
   }
  }
 }
 for(const [id,a] of index.byId){
  if(placements.get(id)!==1||!a.formatsByKey.size)fail('area.'+id);
  if(own(a.field,'default')){
   const v=a.field.default,p='area.'+id+'.default';if(!Array.isArray(v)){fail(p);continue;}
   for(const [i,e] of v.entries()){
    const sf=object(e)&&keys(e,['format','data'])&&typeof e.format==='string'?a.formatsByKey.get(e.format):undefined;
    if(!sf||!object(e.data)){fail(p+'['+i+']');continue;}
    const errors:Issue[]=[],warnings:Issue[]=[];
    if(object(sf.format.inputSchema)&&object(sf.format.inputSchema.fields)&&!Object.values(sf.format.inputSchema.fields).some((v:any)=>v.type==='area'))validateValues(sf.format.inputSchema,e.data,p+'['+i+'].data',errors,warnings);
    issues.push(...[...errors,...warnings].map(e=>({...e,code:'INVALID_TEMPLATE'})));
   }
  }
 }
 return issues;
}
