import {toPt} from '../composition/resolvedDocument.js';
import {MAX_CONTENTS_LEVEL,contentsTitle} from '../composition/contents.js';
import {validateLink} from '../composition/linkContract.js';
import {resolveTableGrid,TableGridError} from '../composition/tableGrid.js';
import type {Table,DocumentNode} from '../composition/resolvedDocument.js';
import type {Issue} from '../result.js';
import type {ObjectSchema,Fragment,Repeat,CellRepeat} from './types.js';
import {object,keys,name,text,own,issue} from './checks.js';
export interface GraphContext {styles:Record<string,unknown>;globalSchema:ObjectSchema;localSchema:ObjectSchema;repeats:Repeat[];resolved?:boolean;images?:boolean;merged?:boolean;links?:boolean;contents?:boolean;cellContent?:boolean;itemImages?:boolean;cellRepeats?:CellRepeat[];areas?:boolean}
export function validateGraph(input:unknown,ctx:GraphContext,path='fragment'):Issue[]{
 let currentNode:string|undefined;
 const issues:Issue[]=[],fail=(p:string,nodeId=currentNode)=>issues.push({...issue('INVALID_TEMPLATE',p),...(nodeId===undefined?{}:{nodeId})});
 if(!object(input)||!keys(input,['rootIds','nodes'])||!Array.isArray(input.rootIds)||!object(input.nodes)){fail(path);return issues;}
 const nodes=input.nodes,ids=new Set<string>(),parents=new Map<string,number>(),edges=new Map<string,string[]>();
 const validId=(id:unknown):id is string=>name(id)&&(ctx.resolved===true||!id.includes('~'));
 const unique=(id:unknown,p:string)=>{if(!validId(id)||ids.has(id))fail(p);else ids.add(id);};
 const refs=(value:unknown,p:string):string[]=>{if(!Array.isArray(value)||!value.every(validId)){fail(p);return [];}return value;};
 const scalarRef=(v:unknown)=>object(v)&&keys(v,['scope','key'])&&['global','local','item'].includes(v.scope)&&name(v.key)&&!v.key.includes('.');
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
 const cellItems=new Map<string,ObjectSchema>(),cellOwners=new Set<string>(),repeatIds=new Set<string>();
 for(const [index,r] of (ctx.cellRepeats??[]).entries()){
  const p=path+`.cellRepeats[${index}]`;
  if(!ctx.itemImages||!object(r)||!keys(r,['id','cellId','childTemplateIds','source'])||!validId(r.id)||repeatIds.has(r.id)||!validId(r.cellId)||cellOwners.has(r.cellId)||!Array.isArray(r.childTemplateIds)||!r.childTemplateIds.length||!r.childTemplateIds.every(validId)||new Set(r.childTemplateIds).size!==r.childTemplateIds.length||!object(r.source)||!keys(r.source,['scope','key'])||!['global','local'].includes(r.source.scope)||!name(r.source.key)){fail(p);continue;}
  repeatIds.add(r.id);cellOwners.add(r.cellId);
  const cell=own(nodes,r.cellId)?nodes[r.cellId]:undefined;
  const schema=r.source.scope==='global'?ctx.globalSchema:ctx.localSchema;
  const field=own(schema.fields,r.source.key)?schema.fields[r.source.key]:undefined;
  if(!object(cell)||cell.type!=='table-cell'||!Array.isArray(cell.childIds)||field?.type!=='array'){fail(p);continue;}
  const start=cell.childIds.indexOf(r.childTemplateIds[0]);
  if(start<0||r.childTemplateIds.some((id:string,i:number)=>cell.childIds[start+i]!==id||!own(nodes,id)||!['text-block','image'].includes(nodes[id]?.type))){fail(p);continue;}
  const forbidden=Object.values(nodes).some(n=>n?.type==='table'&&Array.isArray(n.rowIds)&&n.rowIds.some((rid:string,i:number)=>(i<(n.props?.headerRowCount??0)||repeatItems.has(rid))&&Array.isArray(nodes[rid]?.cellIds)&&nodes[rid].cellIds.includes(r.cellId)));
  if(forbidden){fail(p);continue;}
  for(const id of r.childTemplateIds)cellItems.set(id,field.items);
 }
 for(const [id,n] of Object.entries(nodes)){
  currentNode=id;
  const p=path+'.nodes.'+id;unique(id,p);
  if(!object(n)||n.id!==id){fail(p);continue;}
  let children:string[]=[];
  if(n.type==='text-block'){
   if(!keys(n,['id','type','role','props','children'])||!object(n.role)||!keys(n.role,['role'])||n.role.role!=='paragraph'||!object(n.props)||!keys(n.props,ctx.links?['textStyleId','sizing','anchorId',...(ctx.contents?['toc']:[])]:['textStyleId','sizing'])||!name(n.props.textStyleId)||!own(ctx.styles,n.props.textStyleId)||!Array.isArray(n.children)){fail(p);continue;}
   if(own(n.props,'sizing')&&(!object(n.props.sizing)||!keys(n.props.sizing,['mode'])||n.props.sizing.mode!=='content'))fail(p+'.props.sizing');
   if(own(n.props,'anchorId')&&!(typeof n.props.anchorId==='string'?name(n.props.anchorId)&&!/[\x00-\x1f\x7f]/.test(n.props.anchorId):!ctx.resolved&&scalarRef(n.props.anchorId)))fail(p+'.props.anchorId');
   if(own(n.props,'toc')&&(!ctx.contents||!object(n.props.toc)||!keys(n.props.toc,['level'])||!Number.isInteger(n.props.toc.level)||n.props.toc.level<1||n.props.toc.level>MAX_CONTENTS_LEVEL||!own(n.props,'anchorId')))fail(p+'.props.toc');
   for(const [i,c] of n.children.entries()){
    const cp=p+`.children[${i}]`;if(!object(c)){fail(cp);continue;}unique(c.id,cp+'.id');
    if(c.type==='text'){if(!keys(c,['id','type','text'])||!text(c.text)||!c.text.length)fail(cp);}
    else if(c.type==='line-break'){if(!keys(c,['id','type']))fail(cp);}
    else if(c.type==='field-ref'&&!ctx.resolved){if(!keys(c,['id','type','scope','key'])||!['global','local','item'].includes(c.scope)||!name(c.key)||c.key.includes('.'))fail(cp);}
    else if(ctx.links&&['url','link','reference'].includes(c.type)){
     const {id:_,...command}=c;
     const candidate=Object.fromEntries(Object.entries(command).map(([key,value])=>[key,!ctx.resolved&&key!=='type'&&scalarRef(value)?(key==='url'||key==='value'?'https://example.com':'bound'):value]));
     if(!validateLink(candidate))fail(cp);
    }else fail(cp);
   }
   if(ctx.resolved&&own(n.props,'toc')&&!issues.length&&!contentsTitle(n as import('../composition/resolvedDocument.js').TextBlock))fail(p+'.props.toc');
  }else if(n.type==='area'&&ctx.areas&&!ctx.resolved){
   if(!keys(n,['id','type','props'])||!object(n.props)||!keys(n.props,['areaId'])||!validId(n.props.areaId))fail(p);
  }else if(n.type==='table-of-contents'&&ctx.contents){
   if(!keys(n,['id','type','props'])||!object(n.props)||!keys(n.props,['textStyleId'])||!name(n.props.textStyleId)||!own(ctx.styles,n.props.textStyleId))fail(p);
  }else if(n.type==='image'&&ctx.images){
   if(!keys(n,['id','type','props'])||!object(n.props)||!keys(n.props,['width','height','align',ctx.resolved?'resourceId':'source'])){fail(p);continue;}
   if(own(n.props,'align')&&!['left','center','right'].includes(n.props.align))fail(p+'.props.align');
   if(ctx.resolved){if(typeof n.props.resourceId!=='string'||n.props.resourceId.length>128)fail(p+'.props.resourceId');}
   else {const s=n.props.source;if(!object(s)||!keys(s,['scope','key'])||!['global','local',...(ctx.itemImages?['item']:[])].includes(s.scope)||!name(s.key)||s.key.includes('.'))fail(p+'.props.source');}
   for(const key of ['width','height']){const v=n.props[key];if(!object(v)||!keys(v,['value','unit'])||!['pt','mm'].includes(v.unit)||typeof v.value!=='number'||!Number.isFinite(v.value)||v.value<=0)fail(p+'.props.'+key);}
  }else if(n.type==='table'){
   if(!keys(n,['id','type','props','columns','rowIds'])||!object(n.props)||!keys(n.props,['headerRowCount','repeatHeaderRows'])||!Number.isInteger(n.props.headerRowCount)||n.props.headerRowCount<0||n.props.headerRowCount>1||typeof n.props.repeatHeaderRows!=='boolean'||!Array.isArray(n.columns)||!n.columns.length){fail(p);continue;}
   for(const c of n.columns)if(!object(c)||!keys(c,['width'])||!object(c.width)||!keys(c.width,['unit','value'])||!['mm','pt'].includes(c.width.unit)||typeof c.width.value!=='number'||!Number.isFinite(c.width.value)||c.width.value<=0)fail(p+'.columns');
   children=refs(n.rowIds,p+'.rowIds');if(n.props.headerRowCount>children.length)fail(p+'.props.headerRowCount');
   for(const rid of children){const row=own(nodes,rid)?nodes[rid]:null;if(!object(row)||row.type!=='table-row'||!Array.isArray(row.cellIds)||(!ctx.merged&&row.cellIds.length!==n.columns.length))fail(p+'.rowIds');}
  }else if(n.type==='table-row'){
   if(!keys(n,['id','type','props','cellIds'])||!object(n.props)||!keys(n.props,['allowBreak'])||typeof n.props.allowBreak!=='boolean')fail(p);
   children=refs(n.cellIds,p+'.cellIds');if(!children.length&&!ctx.merged)fail(p+'.cellIds');
   for(const cid of children)if(!own(nodes,cid)||nodes[cid]?.type!=='table-cell')fail(p+'.cellIds');
  }else if(n.type==='table-cell'){
   if(!keys(n,['id','type','props','childIds'])||!object(n.props)||!keys(n.props,[...(ctx.merged?['columnIndex','rowSpan','colSpan']:[]),...(ctx.cellContent?['padding']:[])]))fail(p);
   if(object(n.props)&&own(n.props,'padding')){
    const padding=n.props.padding;
    if(!ctx.cellContent||!object(padding)||!keys(padding,['top','right','bottom','left']))fail(p+'.props.padding');
    else for(const [side,v] of Object.entries(padding))if(!object(v)||!keys(v,['value','unit'])||!['pt','mm'].includes(v.unit)||typeof v.value!=='number'||!Number.isFinite(v.value)||v.value<0||!Number.isFinite(toPt(v as any)))fail(p+'.props.padding.'+side);
   }
   children=refs(n.childIds,p+'.childIds');for(const cid of children)if(!own(nodes,cid)||!['text-block',...(ctx.cellContent?['image']:[]),...(ctx.areas&&!ctx.resolved?['area']:[])].includes(nodes[cid]?.type))fail(p+'.childIds');
  }else fail(p+'.type');
  edges.set(id,children);
  for(const cid of children){if(!own(nodes,cid))fail(p+'.references');parents.set(cid,(parents.get(cid)??0)+1);}
 }

 if(ctx.merged&&issues.length===0)for(const n of Object.values(nodes))if(n.type==='table'){
  try{const grid=resolveTableGrid(n as Table,nodes as Record<string,DocumentNode>);
   if(ctx.cellContent)for(const c of grid.cells){
    const padding=nodes[c.id].props.padding;
    const width=(n as Table).columns.slice(c.column,c.column+c.colSpan).reduce((sum,column)=>sum+toPt(column.width),0);
    const left=padding?.left===undefined?4:toPt(padding.left),right=padding?.right===undefined?4:toPt(padding.right);
    if(!Number.isFinite(width-left-right)||width-left-right<=0)fail(path+'.nodes.'+c.id+'.props.padding',c.id);
   }
   for(const c of grid.cells)if(c.rowSpan>1&&grid.rowIds.slice(c.row,c.row+c.rowSpan).some(id=>repeatItems.has(id)))fail(path+'.nodes.'+c.id+'.props.rowSpan',c.id);
  }catch(e){if(e instanceof TableGridError)fail(path+'.nodes.'+e.nodeId+'.'+e.property,e.nodeId);else fail(path+'.nodes.'+n.id,n.id);}
 }
 if(ctx.contents&&Object.values(nodes).filter(n=>n?.type==='table-of-contents').length>1)fail(path+'.contents');
 currentNode=undefined;
 const roots=refs(input.rootIds,path+'.rootIds');if(!roots.length)fail(path+'.rootIds');
 for(const id of roots){parents.set(id,(parents.get(id)??0)+1);if(!own(nodes,id)||!['text-block','table',...(ctx.images?['image']:[]),...(ctx.contents?['table-of-contents']:[]),...(ctx.areas&&!ctx.resolved?['area']:[])].includes(nodes[id]?.type))fail(path+'.rootIds');}
 for(const id of Object.keys(nodes))if(parents.get(id)!==1)fail(path+'.nodes.'+id+'.parent',id);
 const active=new Set<string>(),visited=new Set<string>();
 const visit=(root:string)=>{
  const pending:{id:string;item:ObjectSchema|undefined;leave:boolean}[]=[{id:root,item:undefined,leave:false}];
  while(pending.length){
   const step=pending.pop()!,id=step.id;
   if(step.leave){active.delete(id);continue;}
   if(active.has(id)){fail(path+'.nodes.'+id+'.cycle',id);continue;}if(visited.has(id))continue;active.add(id);visited.add(id);
   const item=cellItems.get(id)??repeatItems.get(id)??step.item,n=nodes[id];
   if(n?.type==='text-block'&&Array.isArray(n.children)&&!ctx.resolved){
    const checkRef=(v:any,link=false)=>{const schema=v.scope==='global'?ctx.globalSchema:v.scope==='local'?ctx.localSchema:item;
     const type=schema&&typeof v.key==='string'&&own(schema.fields,v.key)?schema.fields[v.key]?.type:undefined;
     if(type!=='string'&&!(link&&ctx.links&&type==='link'))fail(path+'.nodes.'+id+'.bindings',id);
    };
    if(scalarRef(n.props?.anchorId))checkRef(n.props.anchorId);
    for(const c of n.children){if(c?.type==='field-ref')checkRef(c,true);else if(c&&['url','link','reference'].includes(c.type))for(const v of Object.values(c))if(scalarRef(v))checkRef(v);}
   }
   if(n?.type==='image'&&!ctx.resolved){const s=n.props?.source,schema=s?.scope==='global'?ctx.globalSchema:s?.scope==='local'?ctx.localSchema:s?.scope==='item'&&ctx.itemImages?item:undefined;if(!schema||!own(schema.fields,s?.key)||schema.fields[s.key]?.type!=='image')fail(path+'.nodes.'+id+'.props.source',id);}
   pending.push({id,item,leave:true});
   for(const cid of [...(edges.get(id)??[])].reverse())pending.push({id:cid,item,leave:false});
  }
 };
 for(const id of roots)visit(id);
 for(const id of Object.keys(nodes))if(!visited.has(id)){fail(path+'.nodes.'+id+'.orphan');visit(id);}
 return issues;
}
