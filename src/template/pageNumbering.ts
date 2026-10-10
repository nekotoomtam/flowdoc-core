import {object,keys,own,issue} from './checks.js';
import type {Issue} from '../result.js';
import type {PageNumbering} from './types.js';
export function normalizeNumbering(s:{role?:string;numbering?:PageNumbering}):PageNumbering {
 if(s.role==='cover')return {mode:'exclude',visibility:'hide'};
 const n=s.numbering??{mode:'continue'};
 return {...n,visibility:n.visibility??'show',...(n.mode==='restart'?{startAt:n.startAt??1}:{})};
}
export function validateNumbering(s:Record<string,any>,path:string):Issue[]{
 const errors:Issue[]=[],fail=(p:string)=>errors.push(issue('INVALID_TEMPLATE',p)),n=s.numbering;
 if(n!==undefined&&(!object(n)||!keys(n,['mode','visibility',...(n.mode==='restart'?['startAt']:[])])||!['continue','restart','exclude'].includes(n.mode)||(own(n,'visibility')&&!['show','hide'].includes(n.visibility))||(own(n,'startAt')&&(!Number.isSafeInteger(n.startAt)||n.startAt<1)))){fail(path+'.numbering');return errors;}
 if(s.role==='cover'&&n&&(n.mode!=='exclude'||n.visibility!==undefined&&n.visibility!=='hide'))fail(path+'.numbering');
 if(s.role==='cover'||n?.mode==='exclude')for(const k of ['header','footer'])for(const node of Object.values(s[k]?.fragment?.nodes??s[k]?.nodes??{}) as any[])for(const c of node.children??[])if(c.type==='system-page-field'&&c.field==='current')fail(path+'.'+k+'.nodes.'+node.id+'.children.'+c.id);
 return errors;
}
