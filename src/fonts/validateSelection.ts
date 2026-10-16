import type {FontSelection} from './types.js';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const fontUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
export const fontWeight=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=1&&Number(v)<=1000;
export function isFontSelection(v:unknown):v is FontSelection {
 if(!object(v))return false;
 if(v.kind==='unselected')return Object.keys(v).length===1;
 return Object.keys(v).length===4&&v.kind==='library'&&fontUuid(v.releaseId)&&fontWeight(v.weight)&&['normal','italic'].includes(v.style as string);
}
