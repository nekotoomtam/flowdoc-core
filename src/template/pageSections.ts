import {object,keys,name,own,issue} from './checks.js';
import {validateBookStyles} from '../composition/validateResolvedDocument.js';
import {validateGraph} from './validateGraph.js';
import type {Issue} from '../result.js';
import type {TemplateDefinition,Format} from './types.js';
const id=(v:unknown):v is string=>name(v)&&!v.includes('~');
export function authoredHosts(t:TemplateDefinition):[string,Format][] {
 return t.nodeModelVersion===12?t.sections.flatMap(s=>s.source.kind==='authored'?[[`sections.${s.id}`,{...s.source,inputSchema:{type:'object' as const,fields:{}}}] as [string,Format]]:[]):[];
}
export function validatePageSections(t:Record<string,any>):Issue[] {
 const issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_TEMPLATE',p));
 if(!object(t.book)||!keys(t.book,['contentSlot','defaultPageLayoutId'])||t.book.contentSlot!=='body'||!id(t.book.defaultPageLayoutId))fail('book');
 if(!object(t.pageLayouts)||!Object.keys(t.pageLayouts).length)fail('pageLayouts');
 else {
  for(const [key,v] of Object.entries(t.pageLayouts)){
   const p='pageLayouts.'+key;
   if(!id(key)||!object(v)||!keys(v,['label','page'])||(own(v,'label')&&typeof v.label!=='string')){fail(p);continue;}
   issues.push(...validateBookStyles({book:{contentSlot:'body',page:v.page},styles:t.styles}).map(i=>({...i,code:'INVALID_TEMPLATE',path:i.path.startsWith('book')?p+i.path.slice(4):i.path})));
  }
  if(!own(t.pageLayouts,t.book?.defaultPageLayoutId))fail('book.defaultPageLayoutId');
 }
 if(!Array.isArray(t.sections)||!t.sections.length){fail('sections');return issues;}
 const seen=new Set<string>();let content=0;
 for(const [i,s] of t.sections.entries()){
  const p=`sections[${i}]`;
  if(!object(s)||!keys(s,['id','label','pageLayoutId','source'])||!id(s.id)||seen.has(s.id)){fail(p);continue;}seen.add(s.id);
  if(own(s,'label')&&typeof s.label!=='string')fail(p+'.label');
  if(own(s,'pageLayoutId')&&(!id(s.pageLayoutId)||!object(t.pageLayouts)||!own(t.pageLayouts,s.pageLayoutId)))fail(p+'.pageLayoutId');
  const source=s.source;
  if(!object(source)){fail(p+'.source');continue;}
  if(source.kind==='content'){content++;if(!keys(source,['kind']))fail(p+'.source');}
  else if(source.kind==='authored'){
   if(!keys(source,['kind','fragment','repeats','cellRepeats'])||!Array.isArray(source.repeats)||(own(source,'cellRepeats')&&!Array.isArray(source.cellRepeats))){fail(p+'.source');continue;}
   if(object(t.globalSchema)&&object(t.globalSchema.fields)&&object(t.styles))issues.push(...validateGraph(source.fragment,{allowEmptyRoots:true,styles:t.styles,globalSchema:t.globalSchema as TemplateDefinition['globalSchema'],localSchema:{type:'object',fields:{}},repeats:source.repeats,cellRepeats:source.cellRepeats,images:true,merged:true,links:true,contents:true,cellContent:true,itemImages:true,areas:true},p+'.source.fragment'));
  }else fail(p+'.source.kind');
 }
 if(content>1)fail('sections');
 if(content&&object(t.formats)&&!Object.keys(t.formats).length)fail('formats');
 return issues;
}
