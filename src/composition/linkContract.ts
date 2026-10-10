import {object,keys,text} from '../template/checks.js';
import type {ResolvedDocument} from './resolvedDocument.js';
import type {Issue} from '../result.js';
export type BoundLink={type:'url';value:string}|{type:'link';text:string;url:string}|{type:'reference';text:string;target:string};
export function validateExternalUrl(value:unknown):value is string {
 if(typeof value!=='string'||!/^https?:\/\//i.test(value)||/[\s\x00-\x1f\x7f]/u.test(value)||value.includes('\\'))return false;
 try{const u=new URL(value);return !!u.hostname&&!u.username&&!u.password&&['http:','https:'].includes(u.protocol);}catch{return false;}
}
export function validateLink(value:unknown):value is BoundLink {
 if(!object(value))return false;
 if(value.type==='url')return keys(value,['type','value'])&&validateExternalUrl(value.value);
 if(!text(value.text)||!value.text.trim())return false;
 if(value.type==='link')return keys(value,['type','text','url'])&&validateExternalUrl(value.url);
 return value.type==='reference'&&keys(value,['type','text','target'])&&typeof value.target==='string'&&!!value.target.trim()&&!/[\x00-\x1f\x7f]/.test(value.target);
}
export const linkLabel=(value:BoundLink):string=>value.type==='url'?value.value:value.text;
export function validateDestinations(document:ResolvedDocument):Issue[]{
 const issues:Issue[]=[],anchors=new Set<string>();
 const fail=(nodeId:string,path:string)=>issues.push({code:'INVALID_DATA',nodeId,path,message:'Missing or duplicate document destination',...document.sourceMap[nodeId]});
 for(const n of Object.values(document.nodes))if(n.type==='text-block'&&n.props.anchorId!==undefined){if(anchors.has(n.props.anchorId))fail(n.id,'nodes.'+n.id+'.props.anchorId');anchors.add(n.props.anchorId);}
 for(const n of [...Object.values(document.nodes),...Object.values(document.header?.nodes??{}),...Object.values(document.footer?.nodes??{}),...(document.sections??[]).flatMap(s=>[...Object.values(s.header?.nodes??{}),...Object.values(s.footer?.nodes??{})])])if(n.type==='text-block')for(const c of n.children)if(c.type==='reference'&&!anchors.has(c.target))fail(c.id,'nodes.'+n.id+'.children.'+c.id+'.target');
 return issues;
}
