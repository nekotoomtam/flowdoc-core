import type {Issue} from '../result.js';
export const object=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
export const keys=(v:object,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k));
export const name=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0;
export const text=(v:unknown):v is string=>typeof v==='string'&&v.isWellFormed()&&!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(v);
export const own=(v:object,k:PropertyKey)=>Object.hasOwn(v,k);
export const issue=(code:string,path:string,message='Invalid or unsupported value'):Issue=>({code,path,message});
export function freeze<T>(v:T):T {if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
export function canonical(v:unknown):string {if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(object(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
// Parsed-object callers still have to supply JSON values, not getters, sparse arrays,
// cycles or class instances. Read descriptors before reading property values.
export function isJson(v:unknown,ancestors=new Set<object>()):boolean {
 if(v===null||typeof v==='boolean'||typeof v==='string')return true;
 if(typeof v==='number')return Number.isFinite(v);
 if(typeof v!=='object'||(!Array.isArray(v)&&!object(v))||ancestors.has(v))return false;
 ancestors.add(v);
 const ds=Object.getOwnPropertyDescriptors(v),ks=Reflect.ownKeys(ds);
 const valid=ks.every(k=>typeof k==='string'&&(Array.isArray(v)&&k==='length'||(ds[k]!.enumerable&&'value' in ds[k]!&&isJson(ds[k]!.value,ancestors))))&&(!Array.isArray(v)||Object.keys(v).length===v.length);
 ancestors.delete(v);return valid;
}
