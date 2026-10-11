import type {ObjectSchema,RowGroup} from './types.js';
import type {Issue} from '../result.js';
import {object,keys,name,own,issue} from './checks.js';
export interface GroupRowSchema {group:ObjectSchema;item?:ObjectSchema}
// Build ownership once per graph, before walking bindings or resolving the grid.
export function validateRowGroups(input:unknown,nodes:Record<string,any>,scopes:Record<string,ObjectSchema>,repeatRows:Map<string,ObjectSchema>,cellOwners:Set<string>,declarationIds:Set<string>,path:string,issues:Issue[]):Map<string,GroupRowSchema>{
 const rows=new Map<string,GroupRowSchema>();
 const validId=(v:unknown):v is string=>name(v)&&!v.includes('~');
 const ref=(v:any)=>object(v)&&keys(v,['scope','key'])&&name(v.key)&&!v.key.includes('.');
 if(input===undefined)return rows;
 if(!Array.isArray(input)){issues.push(issue('INVALID_TEMPLATE',path));return rows;}
 for(const [i,r] of input.entries()){
  const p=path+`[${i}]`,fail=()=>issues.push(issue('INVALID_TEMPLATE',p));
  if(!object(r)||!keys(r,['id','tableId','rowTemplateIds','source','memberRepeat','pagination'])||!validId(r.id)||declarationIds.has(r.id)||!validId(r.tableId)||!Array.isArray(r.rowTemplateIds)||r.rowTemplateIds.length<3||!r.rowTemplateIds.every(validId)||new Set(r.rowTemplateIds).size!==r.rowTemplateIds.length||!ref(r.source)||!['global','section','local'].includes(r.source.scope)||!object(r.memberRepeat)||!keys(r.memberRepeat,['rowTemplateId','source','emptyRowTemplateId'])||!ref(r.memberRepeat.source)||r.memberRepeat.source.scope!=='group'||(own(r,'pagination')&&(!object(r.pagination)||!keys(r.pagination,['keepStart'])||typeof r.pagination.keepStart!=='boolean'))){fail();continue;}
  declarationIds.add(r.id);
  const table=own(nodes,r.tableId)?nodes[r.tableId]:undefined,schema=scopes[r.source.scope];
  const field=schema&&own(schema.fields,r.source.key)?schema.fields[r.source.key]:undefined;
  if(table?.type!=='table'||!Array.isArray(table.rowIds)||field?.type!=='array'){fail();continue;}
  const inner=own(field.items.fields,r.memberRepeat.source.key)?field.items.fields[r.memberRepeat.source.key]:undefined;
  const start=table.rowIds.indexOf(r.rowTemplateIds[0]);
  if(inner?.type!=='array'||start<0||start<(table.props?.headerRowCount??0)||r.rowTemplateIds.at(-2)!==r.memberRepeat.rowTemplateId||r.rowTemplateIds.at(-1)!==r.memberRepeat.emptyRowTemplateId||r.rowTemplateIds.some((id:string,j:number)=>table.rowIds[start+j]!==id||rows.has(id)||repeatRows.has(id)||nodes[id]?.type!=='table-row'||!Array.isArray(nodes[id]?.cellIds)||nodes[id].cellIds.some((cid:string)=>cellOwners.has(cid)||nodes[cid]?.childIds?.some((child:string)=>nodes[child]?.type==='area')))){fail();continue;}
  for(const id of (r as RowGroup).rowTemplateIds)rows.set(id,{group:field.items,...id===r.memberRepeat.rowTemplateId?{item:inner.items}:{}});
 }
 return rows;
}
