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
 if(!keys(d,['schemaVersion','nodeModelVersion','template','book','styles','rootIds','nodes','sourceMap'])||d.schemaVersion!==1||![4,5,6,7].includes(d.nodeModelVersion))fail('document');
 if(!object(d.template)||!keys(d.template,['templateId','docKey','version'])||!name(d.template.templateId)||!name(d.template.docKey)||!Number.isInteger(d.template.version)||d.template.version<1)fail('template');
 issues.push(...validateBookStyles(d));
 if(!object(d.styles))return issues;
 if(!Array.isArray(d.rootIds)||d.rootIds.length===0||!d.rootIds.every(name)||!object(d.nodes)||!object(d.sourceMap)){fail('graph');return issues;}
 const empty={type:'object' as const,fields:{}};
 issues.push(...validateGraph({rootIds:d.rootIds,nodes:d.nodes},{styles:d.styles,globalSchema:empty,localSchema:empty,repeats:[],resolved:true,images:d.nodeModelVersion>=5,merged:d.nodeModelVersion>=6,links:d.nodeModelVersion===7},'document').map(i=>({...i,code:'LAYOUT_FAILED'})));
 const ids=new Set<string>(Object.keys(d.nodes));
 for(const n of Object.values(d.nodes))if(object(n)&&n.type==='text-block'&&Array.isArray(n.children))for(const c of n.children)if(object(c)&&typeof c.id==='string')ids.add(c.id);
 for(const [id,s] of Object.entries(d.sourceMap)){
  if(!ids.has(id)||!object(s)||!keys(s,['contentIndex','format','sourceId','itemIndex'])||!Number.isInteger(s.contentIndex)||s.contentIndex<0||!name(s.format)||!name(s.sourceId)||(s.itemIndex!==undefined&&(!Number.isInteger(s.itemIndex)||s.itemIndex<0)))fail('sourceMap.'+id);
 }
 for(const id of d.rootIds)if(!Object.hasOwn(d.sourceMap,id))fail('sourceMap.'+id);
 if(!issues.length&&d.nodeModelVersion===7)issues.push(...validateDestinations(d as import('./resolvedDocument.js').ResolvedDocument));
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
