import {object,keys,name,own,issue} from './checks.js';
import {validateSchemas} from './validateSchemas.js';
import {validateGraph} from './validateGraph.js';
import {toPt} from '../composition/resolvedDocument.js';
import type {Issue} from '../result.js';
export const bandLength=(v:any)=>object(v)&&keys(v,['value','unit'])&&['mm','pt'].includes(v.unit)&&typeof v.value==='number'&&Number.isFinite(v.value)&&v.value>=0;
// Flatten only for existing leaf validation/binding; retain authored Columns separately.
export function flatBandFragment(b:any):any {return {rootIds:b.fragment.rootIds.flatMap((id:string)=>{const n=b.fragment.nodes[id];return n?.type==='columns'?n.columns.flatMap((c:any)=>c.childIds):[id];}),nodes:Object.fromEntries(Object.entries(b.fragment.nodes).filter(([,n]:any)=>n.type!=='columns'))};}
export function validatePageBand(b:any,styles:any,path:string,resolved=false,scopeSchemas?:Record<string,import('./types.js').ObjectSchema>,sourceSectionId=path):Issue[]{
 const issues:Issue[]=[],fail=(p:string)=>issues.push(issue('INVALID_TEMPLATE',p));
 const allowed=resolved?['rootIds','nodes','sourceMap','baseTextStyleId','sizing','gap']:['inputSchema','fragment','baseTextStyleId','sizing','gap'];
 if(!object(b)||!keys(b,allowed)||!object(styles)||!own(styles,b.baseTextStyleId)){fail(path);return issues;}
 const minimum=styles[b.baseTextStyleId]?.lineHeightPt;
 if(typeof minimum!=='number'||!Number.isFinite(minimum)||minimum<=0){fail(path+'.baseTextStyleId');return issues;}
 if(own(b,'gap')&&!bandLength(b.gap))fail(path+'.gap');
 if(own(b,'sizing')){const s=b.sizing;if(!object(s)||!['content','fixed'].includes(s.mode))fail(path+'.sizing');else if(s.mode==='fixed'){if(!keys(s,['mode','height'])||!bandLength(s.height)||toPt(s.height)<minimum)fail(path+'.sizing.height');}else{if(!keys(s,['mode','minHeight','maxHeight']))fail(path+'.sizing');for(const k of ['minHeight','maxHeight'])if(own(s,k)&&(!bandLength(s[k])||toPt(s[k])<minimum))fail(path+'.sizing.'+k);if(bandLength(s.minHeight)&&bandLength(s.maxHeight)&&toPt(s.minHeight)>toPt(s.maxHeight))fail(path+'.sizing');}}
 const empty={type:'object' as const,fields:{}};
 if(!resolved){validateSchemas(b.inputSchema,path+'.inputSchema',issues,false,true,true);if(object(b.inputSchema?.fields))for(const [key,f] of Object.entries(b.inputSchema.fields))if(!object(f)||!['string','image','link'].includes(f.type))fail(path+'.inputSchema.fields.'+key);}
 const f=resolved?{rootIds:b.rootIds,nodes:b.nodes}:b.fragment;
 if(!object(f)||!keys(f,['rootIds','nodes'])||!Array.isArray(f.rootIds)||!object(f.nodes)){fail(path+'.fragment');return issues;}
 const referenced=new Set<string>();
 for(const [id,n] of Object.entries(f.nodes)){
  if(!object(n)||n.id!==id||!name(id)){fail(path+'.nodes.'+id);continue;}
  if(n.type==='columns'){
   if(!f.rootIds.includes(id)||!keys(n,['id','type','props','columns'])||!object(n.props)||!keys(n.props,['gap'])||(own(n.props,'gap')&&!bandLength(n.props.gap))||!Array.isArray(n.columns)||!n.columns.length){fail(path+'.nodes.'+id);continue;}
   for(const c of n.columns){if(!object(c)||!keys(c,['weight','childIds'])||typeof c.weight!=='number'||!Number.isFinite(c.weight)||c.weight<=0||!Array.isArray(c.childIds)){fail(path+'.nodes.'+id);continue;}for(const child of c.childIds){if(!['text-block','image'].includes(f.nodes[child]?.type)||referenced.has(child)||f.rootIds.includes(child))fail(path+'.nodes.'+id);referenced.add(child);}}
  }else if(!['text-block','image'].includes(n.type))fail(path+'.nodes.'+id);
  if(n.type==='text-block'&&object(n.props)&&(own(n.props,'toc')||own(n.props,'anchorId')||n.props.heightMode==='fixed'))fail(path+'.nodes.'+id+'.props');
 }
 if(new Set(f.rootIds).size!==f.rootIds.length)fail(path+'.rootIds');
 if(issues.length)return issues;
 const flat=flatBandFragment({fragment:f});
 issues.push(...validateGraph(flat,{styles,scopeSchemas,globalSchema:resolved?empty:b.inputSchema,localSchema:empty,repeats:[],allowEmptyRoots:true,heightModes:true,resolved,images:true,links:true},path+'.fragment'));
 // Local and item bindings must never resolve from an accidental empty/default namespace.
 if(!resolved&&!scopeSchemas)for(const n of Object.values(flat.nodes) as any[]){if(n.type==='image'&&n.props.source?.scope!=='global')fail(path+'.nodes.'+n.id);for(const c of n.children??[]){if(c.scope!==undefined&&c.scope!=='global')fail(path+'.nodes.'+n.id);for(const v of Object.values(c))if(object(v)&&own(v,'scope')&&v.scope!=='global')fail(path+'.nodes.'+n.id);}}
 if(resolved){if(!object(b.sourceMap))fail(path+'.sourceMap');else{const expected=new Set<string>();for(const n of Object.values(f.nodes) as any[]){expected.add(n.id);for(const c of n.children??[])expected.add(c.id);}for(const id of expected){const s=b.sourceMap[id];if(!object(s)||!keys(s,['origin','sectionId','sourceId'])||s.origin!=='authored'||s.sectionId!==sourceSectionId||!name(s.sourceId))fail(path+'.sourceMap.'+id);}for(const id of Object.keys(b.sourceMap))if(!expected.has(id))fail(path+'.sourceMap.'+id);}}
 return issues;
}
