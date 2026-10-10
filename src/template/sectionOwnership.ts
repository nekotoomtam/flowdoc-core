import {createHash} from 'node:crypto';
import {object,keys,name,own,isJson,issue,canonical,freeze} from './checks.js';
import {validateSchemas} from './validateSchemas.js';
import {validatePageSections} from './pageSections.js';
import {validatePageBand} from './pageBands.js';
import {validateGraph} from './validateGraph.js';
import {buildAreaIndex} from './areas.js';
import {validateValues} from '../data/validateValues.js';
import {prepareSections} from '../data/prepareSections.js';
import type {Template15,Format,Section15,ValidatedTemplate,ObjectSchema} from './types.js';
import type {Issue,Result} from '../result.js';
const empty:ObjectSchema={type:'object',fields:{}};
export function validateOwnedTemplate(input:unknown):Result<ValidatedTemplate>{
 const issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_TEMPLATE',p));
 if(!isJson(input)||!object(input))return {ok:false,issues:[issue('INVALID_TEMPLATE','template')],warnings:[]};
 const t=structuredClone(input) as any;
 if(!keys(t,['schemaVersion','nodeModelVersion','templateId','docKey','version','name','book','styles','globalSchema','examples','pageLayouts','sections','areaFormats'])||t.schemaVersion!==1||t.nodeModelVersion!==15)fail('template');
 for(const k of ['templateId','docKey','name'])if(!name(t[k]))fail(k);
 if(!Number.isInteger(t.version)||t.version<1)fail('version');
 validateSchemas(t.globalSchema,'globalSchema',issues,false,true,true,true,true);
 if(!Array.isArray(t.sections)||!t.sections.length)fail('sections');
 const seen=new Set<string>(),areaIds=new Set<string>();
 const schemas:any[]=[t.globalSchema];
 for(const [i,s] of (Array.isArray(t.sections)?t.sections:[]).entries()){
  const p=`sections[${i}]`;if(!object(s)){fail(p);continue;}
  if(!name(s.key)||s.key.includes('.')||seen.has(s.key))fail(p+'.key');else seen.add(s.key);
  validateSchemas(s.inputSchema,p+'.inputSchema',issues,false,true,true,true,true);schemas.push(s.inputSchema);
  if(!object(s.formats))fail(p+'.formats');else for(const [key,f] of Object.entries(s.formats)){
   const fp=p+'.formats.'+key;
   if(!name(key)||!object(f)||!keys(f,['label','description','inputSchema','fragment','repeats','cellRepeats'])){fail(fp);continue;}
   for(const k of ['label','description'])if(own(f,k)&&typeof f[k]!=='string')fail(fp+'.'+k);
   validateSchemas(f.inputSchema,fp+'.inputSchema',issues,false,true,true,true,true);schemas.push(f.inputSchema);
   if(!Array.isArray(f.repeats)||(own(f,'cellRepeats')&&!Array.isArray(f.cellRepeats)))fail(fp+'.repeats');
   else if(!issues.length)issues.push(...validateOwnedGraph(t,s as unknown as Section15,f as unknown as Format,fp));
  }
  for(const k of ['header','footer'])if(own(s,k)&&!issues.length)issues.push(...validatePageBand(s[k],t.styles,p+'.'+k,false,{global:t.globalSchema,section:s.inputSchema,[k]:s[k]?.inputSchema}));
 }
 if(issues.length)return {ok:false,issues,warnings:[]};
 issues.push(...validatePageSections(t));
 for(const schema of schemas)for(const f of Object.values(schema.fields) as any[])if(f.type==='area'){if(areaIds.has(f.areaId))fail('areaId');areaIds.add(f.areaId);}
 if(t.areaFormats!==undefined&&!object(t.areaFormats))fail('areaFormats');
 if(!issues.length)issues.push(...validateOwnedAreas(t));
 if(!Array.isArray(t.examples))fail('examples');
 if(issues.length)return {ok:false,issues,warnings:[]};
 const fingerprint=createHash('sha256').update(canonical(t)).digest('hex'),names=new Set<string>();
 for(const [i,e] of t.examples.entries()){
  if(!object(e)||!keys(e,['name','request'])||!name(e.name)||names.has(e.name)){fail(`examples[${i}]`);continue;}names.add(e.name);
  if(e.request?.version!==t.version)fail(`examples[${i}].request.version`);
  const r=prepareSections(t,fingerprint,e.request);issues.push(...[...(!r.ok?r.issues:[]),...r.warnings].map(x=>({...x,code:'INVALID_TEMPLATE',path:`examples[${i}].request.`+x.path})));
 }
 return issues.length?{ok:false,issues,warnings:[]}:{ok:true,value:freeze({definition:t,fingerprint}),warnings:[]};
}
function validateOwnedGraph(t:Template15,s:Section15,f:Format,path:string,areas=true):Issue[]{return validateGraph(f.fragment,{styles:t.styles,globalSchema:t.globalSchema,localSchema:f.inputSchema,scopeSchemas:{global:t.globalSchema,section:s.inputSchema,local:f.inputSchema},repeats:f.repeats,cellRepeats:f.cellRepeats??[],heightModes:true,images:true,merged:true,links:true,contents:true,cellContent:true,itemImages:true,areas},path+'.fragment');}
function validateOwnedAreas(t:Template15):Issue[]{
 const issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_TEMPLATE',p)),index=buildAreaIndex(t),placements=new Map<string,{section:Section15;count:number}>();
 for(const s of t.sections)for(const [host,f] of [...Object.entries(s.formats),...(s.source.kind==='authored'?[['',s.source] as const]:[])])for(const n of Object.values(f.fragment.nodes))if(n.type==='area'){
  const a=index.byId.get(n.props.areaId),p=`sections.${s.key}.area.${n.props.areaId}`;
  if(!a||(a.sectionId!==undefined&&a.sectionId!==s.id)||(a.scope==='local'&&a.hostFormat!==host)){fail(p);continue;}
  const prev=placements.get(a.field.areaId);placements.set(a.field.areaId,{section:s,count:(prev?.count??0)+1});
  const cell=Object.values(f.fragment.nodes).find((v:any)=>v.type==='table-cell'&&v.childIds.includes(n.id)) as any;
  if(cell){const row=Object.values(f.fragment.nodes).find((v:any)=>v.type==='table-row'&&v.cellIds.includes(cell.id)) as any;const table=Object.values(f.fragment.nodes).find((v:any)=>v.type==='table'&&v.rowIds.includes(row?.id)) as any;
   if(!row||!table||table.rowIds.indexOf(row.id)<table.props.headerRowCount||f.repeats.some(r=>r.rowTemplateId===row.id)||f.cellRepeats?.some(r=>r.childTemplateIds.includes(n.id)))fail(p);
   for(const sf of a.formatsByKey.values())if(!sf.format.fragment?.rootIds?.every(id=>['text-block','image'].includes(sf.format.fragment.nodes[id]?.type??'')))fail(p+'.cellContent');
  }
 }
 const names=new Set<string>();
 for(const [id,f] of Object.entries(t.areaFormats??{})){
  const p='areaFormats.'+id,a=index.byId.get(f?.ownerAreaId),place=a&&placements.get(a.field.areaId),key=JSON.stringify([f?.ownerAreaId,f?.key]);
  if(!name(id)||id.includes('~')||!object(f)||!keys(f,['key','ownerAreaId','label','description','inputSchema','fragment','repeats','cellRepeats'])||!name(f.key)||!a||!place||names.has(key)){fail(p);continue;}names.add(key);
  const valid=validateSchemas(f.inputSchema,p+'.inputSchema',issues,false,true,true,true,false);
  if(!Array.isArray(f.repeats)||(f.cellRepeats!==undefined&&!Array.isArray(f.cellRepeats)))fail(p+'.repeats');else if(valid)issues.push(...validateOwnedGraph(t,place.section,f,p,false));
 }
 for(const [id,a] of index.byId){if(placements.get(id)?.count!==1||!a.formatsByKey.size)fail('area.'+id);if(own(a.field,'default'))validateValues({type:'object',fields:{[a.key]:a.field}},{[a.key]:a.field.default},'area.'+id,issues,[],'request',false,index);}
 return issues;
}
