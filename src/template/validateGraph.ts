import type {Issue} from '../result.js';
import type {ObjectSchema,Fragment,Repeat} from './types.js';
import {object,keys,name,text,own,issue} from './checks.js';
export interface GraphContext {styles:Record<string,unknown>;globalSchema:ObjectSchema;localSchema:ObjectSchema;repeats:Repeat[];resolved?:boolean}
export function validateGraph(input:unknown,ctx:GraphContext,path='fragment'):Issue[]{
 let currentNode:string|undefined;
 const issues:Issue[]=[],fail=(p:string,nodeId=currentNode)=>issues.push({...issue('INVALID_TEMPLATE',p),...(nodeId===undefined?{}:{nodeId})});
 if(!object(input)||!keys(input,['rootIds','nodes'])||!Array.isArray(input.rootIds)||!object(input.nodes)){fail(path);return issues;}
 const nodes=input.nodes,ids=new Set<string>(),parents=new Map<string,number>(),edges=new Map<string,string[]>();
 const validId=(id:unknown):id is string=>name(id)&&(ctx.resolved===true||!id.includes('~'));
 const unique=(id:unknown,p:string)=>{if(!validId(id)||ids.has(id))fail(p);else ids.add(id);};
 const refs=(value:unknown,p:string):string[]=>{if(!Array.isArray(value)||!value.every(validId)){fail(p);return [];}return value;};
 const repeatItems=new Map<string,ObjectSchema>();
 for(const [index,r] of ctx.repeats.entries()){
  const p=path+`.repeats[${index}]`;
  if(!object(r)||!keys(r,['tableId','rowTemplateId','source'])||!name(r.tableId)||!name(r.rowTemplateId)||!object(r.source)||!keys(r.source,['scope','key'])||!['global','local'].includes(r.source.scope)||!name(r.source.key)){fail(p);continue;}
  const table=own(nodes,r.tableId)?nodes[r.tableId]:null;
  const schema=r.source.scope==='global'?ctx.globalSchema:ctx.localSchema;
  const field=own(schema.fields,r.source.key)?schema.fields[r.source.key]:undefined;
  if(!object(table)||table.type!=='table'||!Array.isArray(table.rowIds)||!table.rowIds.includes(r.rowTemplateId)||table.rowIds.indexOf(r.rowTemplateId)<(table.props?.headerRowCount??0)||repeatItems.has(r.rowTemplateId)||field?.type!=='array'){fail(p);continue;}
  repeatItems.set(r.rowTemplateId,field.items);
 }
 for(const [id,n] of Object.entries(nodes)){
  currentNode=id;
  const p=path+'.nodes.'+id;unique(id,p);
  if(!object(n)||n.id!==id){fail(p);continue;}
  let children:string[]=[];
  if(n.type==='text-block'){
   if(!keys(n,['id','type','role','props','children'])||!object(n.role)||!keys(n.role,['role'])||n.role.role!=='paragraph'||!object(n.props)||!keys(n.props,['textStyleId','sizing'])||!name(n.props.textStyleId)||!own(ctx.styles,n.props.textStyleId)||!Array.isArray(n.children)){fail(p);continue;}
   if(own(n.props,'sizing')&&(!object(n.props.sizing)||!keys(n.props.sizing,['mode'])||n.props.sizing.mode!=='content'))fail(p+'.props.sizing');
   for(const [i,c] of n.children.entries()){
    const cp=p+`.children[${i}]`;if(!object(c)){fail(cp);continue;}unique(c.id,cp+'.id');
    if(c.type==='text'){if(!keys(c,['id','type','text'])||!text(c.text)||!c.text.length)fail(cp);}
    else if(c.type==='line-break'){if(!keys(c,['id','type']))fail(cp);}
    else if(c.type==='field-ref'&&!ctx.resolved){if(!keys(c,['id','type','scope','key'])||!['global','local','item'].includes(c.scope)||!name(c.key)||c.key.includes('.'))fail(cp);}
    else fail(cp);
   }
  }else if(n.type==='table'){
   if(!keys(n,['id','type','props','columns','rowIds'])||!object(n.props)||!keys(n.props,['headerRowCount','repeatHeaderRows'])||!Number.isInteger(n.props.headerRowCount)||n.props.headerRowCount<0||n.props.headerRowCount>1||typeof n.props.repeatHeaderRows!=='boolean'||!Array.isArray(n.columns)||!n.columns.length){fail(p);continue;}
   for(const c of n.columns)if(!object(c)||!keys(c,['width'])||!object(c.width)||!keys(c.width,['unit','value'])||!['mm','pt'].includes(c.width.unit)||typeof c.width.value!=='number'||!Number.isFinite(c.width.value)||c.width.value<=0)fail(p+'.columns');
   children=refs(n.rowIds,p+'.rowIds');if(n.props.headerRowCount>children.length)fail(p+'.props.headerRowCount');
   for(const rid of children){const row=own(nodes,rid)?nodes[rid]:null;if(!object(row)||row.type!=='table-row'||!Array.isArray(row.cellIds)||row.cellIds.length!==n.columns.length)fail(p+'.rowIds');}
  }else if(n.type==='table-row'){
   if(!keys(n,['id','type','props','cellIds'])||!object(n.props)||!keys(n.props,['allowBreak'])||typeof n.props.allowBreak!=='boolean')fail(p);
   children=refs(n.cellIds,p+'.cellIds');if(!children.length)fail(p+'.cellIds');
   for(const cid of children)if(!own(nodes,cid)||nodes[cid]?.type!=='table-cell')fail(p+'.cellIds');
  }else if(n.type==='table-cell'){
   if(!keys(n,['id','type','props','childIds'])||!object(n.props)||!keys(n.props,[]))fail(p);
   children=refs(n.childIds,p+'.childIds');for(const cid of children)if(!own(nodes,cid)||nodes[cid]?.type!=='text-block')fail(p+'.childIds');
  }else fail(p+'.type');
  edges.set(id,children);
  for(const cid of children){if(!own(nodes,cid))fail(p+'.references');parents.set(cid,(parents.get(cid)??0)+1);}
 }
 currentNode=undefined;
 const roots=refs(input.rootIds,path+'.rootIds');if(!roots.length)fail(path+'.rootIds');
 for(const id of roots){parents.set(id,(parents.get(id)??0)+1);if(!own(nodes,id)||!['text-block','table'].includes(nodes[id]?.type))fail(path+'.rootIds');}
 for(const id of Object.keys(nodes))if(parents.get(id)!==1)fail(path+'.nodes.'+id+'.parent',id);
 const active=new Set<string>(),visited=new Set<string>();
 const visit=(root:string)=>{
  const pending:{id:string;item:ObjectSchema|undefined;leave:boolean}[]=[{id:root,item:undefined,leave:false}];
  while(pending.length){
   const step=pending.pop()!,id=step.id;
   if(step.leave){active.delete(id);continue;}
   if(active.has(id)){fail(path+'.nodes.'+id+'.cycle',id);continue;}if(visited.has(id))continue;active.add(id);visited.add(id);
   const item=repeatItems.get(id)??step.item,n=nodes[id];
   if(n?.type==='text-block'&&Array.isArray(n.children))for(const c of n.children){if(c?.type!=='field-ref')continue;
    const schema=c.scope==='global'?ctx.globalSchema:c.scope==='local'?ctx.localSchema:item;
    if(!schema||typeof c.key!=='string'||!own(schema.fields,c.key)||schema.fields[c.key]?.type!=='string')fail(path+'.nodes.'+id+'.children',id);
   }
   pending.push({id,item,leave:true});
   for(const cid of [...(edges.get(id)??[])].reverse())pending.push({id:cid,item,leave:false});
  }
 };
 for(const id of roots)visit(id);
 for(const id of Object.keys(nodes))if(!visited.has(id)){fail(path+'.nodes.'+id+'.orphan');visit(id);}
 return issues;
}
