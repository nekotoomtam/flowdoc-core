import {validateNumbering} from '../template/pageNumbering.js';
import {validatePageBand} from '../template/pageBands.js';
import {validateDestinations} from './linkContract.js';
import {validateGraph} from '../template/validateGraph.js';
import {isJson} from '../template/checks.js';
import type { Issue } from '../result.js';

const object=(v:unknown):v is Record<string,any> => !!v && typeof v==='object' && !Array.isArray(v);
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const name=(v:unknown)=>typeof v==='string'&&v.length>0;
function keys(v:Record<string,unknown>,allowed:string[]) {return Object.keys(v).every(k=>allowed.includes(k));}
// Validation guards untrusted JSON before typed layout; no implicit coercions.
export function validateResolvedDocument(input:unknown):Issue[] {
 const issues:Issue[]=[];
 const fail=(path:string,nodeId?:string)=>issues.push({code:'LAYOUT_FAILED',path,message:'Invalid or unsupported resolved document value',...(nodeId?{nodeId}:{})});
 if(!isJson(input)||!object(input)){fail('document');return issues;}
 const d=input;
 if(!keys(d,['schemaVersion','nodeModelVersion','template','book','styles','rootIds','nodes','sourceMap',...(d.nodeModelVersion===14?['header','footer']:[]),...((d.nodeModelVersion===12||d.nodeModelVersion===13||d.nodeModelVersion===14||(d.nodeModelVersion===15||d.nodeModelVersion===16))?['sections']:[])])||d.schemaVersion!==1||![4,5,6,7,8,9,10,11,12,13,14,15,16].includes(d.nodeModelVersion))fail('document');
 if(!object(d.template)||!keys(d.template,['templateId','docKey','version'])||!name(d.template.templateId)||!name(d.template.docKey)||!Number.isInteger(d.template.version)||d.template.version<1)fail('template');
 issues.push(...validateBookStyles(d));
 if(!object(d.styles))return issues;
 if(!Array.isArray(d.rootIds)||(d.rootIds.length===0&&!(d.nodeModelVersion>=13&&Array.isArray(d.sections)&&d.sections.some((s:any)=>s?.role==='cover'||s?.sourceKind==='blank')))||!d.rootIds.every(name)||!object(d.nodes)||!object(d.sourceMap)){fail('graph');return issues;}
 const empty={type:'object' as const,fields:{}};
 issues.push(...validateGraph({rootIds:d.rootIds,nodes:d.nodes},{allowEmptyRoots:d.nodeModelVersion>=13,heightModes:d.nodeModelVersion>=13,fixedRootIds:d.nodeModelVersion>=13&&Array.isArray(d.sections)?d.sections.filter((s:any)=>s?.role==='cover'&&s?.sourceKind==='authored').flatMap((s:any)=>Array.isArray(s.rootIds)?s.rootIds.filter((id:string)=>d.sourceMap[id]?.origin==='authored'&&d.sourceMap[id]?.areaId===undefined&&d.sourceMap[id]?.itemIndex===undefined):[]):[],styles:d.styles,globalSchema:empty,localSchema:empty,repeats:[],resolved:true,images:d.nodeModelVersion>=5,merged:d.nodeModelVersion>=6,links:d.nodeModelVersion>=7,contents:d.nodeModelVersion>=8,cellContent:d.nodeModelVersion>=9},'document').map(i=>({...i,code:'LAYOUT_FAILED'})));
 const ids=new Set<string>(Object.keys(d.nodes));
 for(const n of Object.values(d.nodes))if(object(n)&&n.type==='text-block'&&Array.isArray(n.children))for(const c of n.children)if(object(c)&&typeof c.id==='string')ids.add(c.id);
 for(const [id,s] of Object.entries(d.sourceMap)){
  if(object(s)&&['areaId','areaEntryIndex','areaFormatId'].some(k=>Object.hasOwn(s,k))&&(!name(s.areaId)||s.areaId.includes('~')||!name(s.areaFormatId)||s.areaFormatId.includes('~')||!Number.isSafeInteger(s.areaEntryIndex)||s.areaEntryIndex<0))fail('sourceMap.'+id);
  if(!ids.has(id)||!object(s)||!keys(s,['contentIndex','format','sourceId','itemIndex',...(d.nodeModelVersion>=10?['repeatId']:[]),...(d.nodeModelVersion>=11?['areaId','areaEntryIndex','areaFormatId']:[]),...((d.nodeModelVersion===12||d.nodeModelVersion===13||d.nodeModelVersion===14||(d.nodeModelVersion===15||d.nodeModelVersion===16))?['origin','sectionId']:[])])||!((d.nodeModelVersion===12||d.nodeModelVersion===13||d.nodeModelVersion===14||(d.nodeModelVersion===15||d.nodeModelVersion===16))&&s.origin==='authored'?s.contentIndex===undefined&&s.format===undefined:Number.isInteger(s.contentIndex)&&s.contentIndex>=0&&name(s.format))||!name(s.sourceId)||(s.itemIndex!==undefined&&(!Number.isInteger(s.itemIndex)||s.itemIndex<0))||(s.repeatId!==undefined&&(!name(s.repeatId)||s.repeatId.includes('~')||s.itemIndex===undefined)))fail('sourceMap.'+id);
 }
 if((d.nodeModelVersion===12||d.nodeModelVersion===13||d.nodeModelVersion===14||(d.nodeModelVersion===15||d.nodeModelVersion===16)))validateSections(d,issues);
 for(const id of d.rootIds)if(!Object.hasOwn(d.sourceMap,id))fail('sourceMap.'+id);
 if(d.nodeModelVersion===14)for(const k of ['header','footer'])if(Object.hasOwn(d,k))issues.push(...validatePageBand(d[k],d.styles,k,true).map(i=>({...i,code:'LAYOUT_FAILED'})));
 if(!issues.length&&d.nodeModelVersion>=7)issues.push(...validateDestinations(d as import('./resolvedDocument.js').ResolvedDocument));
 return issues;
}

export function validateBookStyles(d:Record<string,any>):Issue[]{
 const issues:Issue[]=[];
 const fail=(path:string)=>issues.push({code:"LAYOUT_FAILED",path,message:"Invalid page or text style"});
 const page=d.book?.page;
 if(!object(d.book)||!keys(d.book,['contentSlot','page'])||d.book.contentSlot!=='body'||!object(page)||!keys(page,['size','orientation','margin'])||page.size!=='A4'||!['portrait','landscape'].includes(page.orientation)||!object(page.margin))fail('book');
 else {
  if(!keys(page.margin,['top','right','bottom','left']))fail('book.page.margin');
  const values:Record<string,number>={};
  for(const side of ['top','right','bottom','left']){
   const v=page.margin[side];
   if(!object(v)||!keys(v,['value','unit'])||!['pt','mm'].includes(v.unit)||typeof v.value!=='number'||!Number.isFinite(v.value)||v.value<0)fail('book.page.margin.'+side);
   else values[side]=v.value*(v.unit==='mm'?72/25.4:1);
  }
  const [w,h]=page.orientation==='portrait'?[210,297]:[297,210];
  if((values.left??Infinity)+(values.right??Infinity)>=w!*72/25.4||(values.top??Infinity)+(values.bottom??Infinity)>=h!*72/25.4)fail('book.page.margin');
 }
 if(!object(d.styles)){fail('styles');return issues;}
 for(const [id,s] of Object.entries(d.styles)){
  if(!object(s)||!keys(s,['fontFamilyKey','fontWeight','fontStyle','fontSize','lineHeightPt'])||s.fontFamilyKey!=='sarabun'||!['normal','bold'].includes(s.fontWeight)||(s.fontStyle!==undefined&&!['normal','italic'].includes(s.fontStyle))||!object(s.fontSize)||!keys(s.fontSize,['value','unit'])||s.fontSize.unit!=='pt'||!number(s.fontSize.value)||!number(s.lineHeightPt))fail('styles.'+id);
 }
 return issues;
}

function validateSections(d:Record<string,any>,issues:Issue[]):void {
 const fail=(path:string)=>issues.push({code:'LAYOUT_FAILED',path,message:'Invalid section membership or page'});
 if(!Array.isArray(d.sections)||!d.sections.length){fail('sections');return;}
 const seen=new Set<string>(),roots:string[]=[],members=new Map<string,string>();
 for(const [i,s] of d.sections.entries()){
  const p=`sections[${i}]`;
  if(!object(s)||!keys(s,['sectionId','pageLayoutId','page','rootIds',...(d.nodeModelVersion===16?['numbering']:[]),...(d.nodeModelVersion>=14?['headerMode','footerMode']:[]),...((d.nodeModelVersion===15||d.nodeModelVersion===16)?['header','footer']:[]),...(d.nodeModelVersion>=13?['role','sourceKind']:[])])||!name(s.sectionId)||s.sectionId.includes('~')||seen.has(s.sectionId)||!name(s.pageLayoutId)||s.pageLayoutId.includes('~')||!Array.isArray(s.rootIds)||!s.rootIds.every(name)){fail(p);continue;}
  if(d.nodeModelVersion>=13&&(!['body','cover'].includes(s.role)||!['content','authored','blank'].includes(s.sourceKind)||(s.role==='cover'&&(i!==0||s.sourceKind!=='authored'))||(s.sourceKind==='blank'&&s.rootIds.length)))fail(p);
  if(d.nodeModelVersion>=14)for(const k of ['headerMode','footerMode'])if(!['all','first','continuation','none'].includes(s[k]))fail(p+'.'+k);
  if(d.nodeModelVersion===16)issues.push(...validateNumbering(s,p).map(e=>({...e,code:'LAYOUT_FAILED'})));
  if((d.nodeModelVersion===15||d.nodeModelVersion===16))for(const k of ['header','footer'])if(Object.hasOwn(s,k))issues.push(...validatePageBand(s[k],d.styles,p+'.'+k,true,undefined,s.sectionId,d.nodeModelVersion===16).map(e=>({...e,code:'LAYOUT_FAILED'})));
  seen.add(s.sectionId);roots.push(...s.rootIds);
  issues.push(...validateBookStyles({book:{contentSlot:'body',page:s.page},styles:d.styles}).map(e=>({...e,path:p+'.'+e.path})));
  const pending=[...s.rootIds],visited=new Set<string>();
  while(pending.length){const id=pending.pop()!;if(visited.has(id)){fail(p+'.rootIds');continue;}visited.add(id);
   if(members.has(id)){fail(p+'.rootIds');continue;}members.set(id,s.sectionId);
   const n=d.nodes[id];if(!object(n))continue;
   if(n.type==='text-block'&&Array.isArray(n.children))for(const c of n.children)if(object(c))members.set(c.id,s.sectionId);
   for(const key of ['rowIds','cellIds','childIds'])if(Array.isArray(n[key]))pending.push(...n[key]);
  }
 }
 if(JSON.stringify(roots)!==JSON.stringify(d.rootIds))fail('sections.rootIds');
 for(const [id,s] of Object.entries(d.sourceMap))if(!object(s)||!['content','authored'].includes(s.origin)||members.get(id)!==s.sectionId)fail('sourceMap.'+id);
 for(const id of members.keys())if(!Object.hasOwn(d.sourceMap,id))fail('sourceMap.'+id);
}
