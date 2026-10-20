import type {ValidatedTemplate,ObjectSchema,Format} from './types.js';
import {buildAreaIndex} from './areas.js';

/** Operation-local metadata only. Never holds task data, handles or iterators.
 * A fresh owner for every call prevents reuse across fingerprints/models/clones.
 * Validated definitions are deeply frozen; no mutable public cache is shared.
 */
export class TemplateAccess {
 readonly stats={entries:0,bytes:0,hits:0,misses:0,fallbacks:0};
 private plans=new Map<object,unknown>();
 readonly areaIndex:ReturnType<typeof buildAreaIndex>;
 constructor(readonly template:ValidatedTemplate,private enabled=true,private budget=1048576){this.areaIndex=buildAreaIndex(template.definition);}
 private plan<T>(key:object,build:()=>T,charge:(p:T)=>number):T{
  const found=this.plans.get(key);if(found){this.stats.hits++;return found as T;}
  this.stats.misses++;const p=build(),bytes=charge(p);
  if(this.enabled&&this.stats.entries<2048&&this.stats.bytes+bytes<=this.budget){this.plans.set(key,p);this.stats.entries++;this.stats.bytes+=bytes;}else this.stats.fallbacks++;
  return p;
 }
 schema(s:ObjectSchema){return this.plan(s,()=>({entries:Object.entries(s.fields),keys:Object.keys(s.fields)}),p=>128+p.keys.reduce((n,k)=>n+128+Buffer.byteLength(k)*2,0));}
 format(f:Format){return this.plan(f,()=>({repeats:new Map(f.repeats.map(r=>[r.rowTemplateId,r])),cellRepeats:new Map((f.cellRepeats??[]).map(r=>[r.cellId,r])),groupStarts:new Map((f.rowGroups??[]).map(g=>[g.rowTemplateIds[0]!,g]))}),p=>128+(p.repeats.size+p.cellRepeats.size+p.groupStarts.size)*256);}
 refs(n:any):readonly {scope:string;key:string}[]{return this.plan(n,()=>{
  const refs:any[]=[];if(n.type==='image')refs.push(n.props.source);
  if(n.type==='text-block'){if(n.props.anchorId&&typeof n.props.anchorId==='object')refs.push(n.props.anchorId);for(const c of n.children){if(c.type==='field-ref')refs.push(c);else if(['url','link','reference'].includes(c.type))for(const v of Object.values(c))if(v&&typeof v==='object')refs.push(v);}}
  return refs;
 },p=>128+p.reduce((size,r)=>size+128+Buffer.byteLength(r.scope)*2+Buffer.byteLength(r.key)*2,0));}
 clear(){this.plans.clear();this.stats.bytes=0;this.stats.entries=0;}
}
