import {isDeepStrictEqual} from 'node:util';
import {validateNormalizedTaskInput,type TaskValue,type TaskImageResource} from '../data/taskInput.js';
import type {ValidatedTemplate} from '../template/types.js';
import type {ResolvedDocument} from './resolvedDocument.js';
import type {Result} from '../result.js';
import {validateResolvedDocument} from './validateResolvedDocument.js';
import {ExpansionBudget,ExpansionLimitError} from '../binding/expansionBudget.js';
import {composeSectionsSteps} from './composeSections.js';
import type {BindingEffect} from '../binding/expansionSteps.js';
import {retainTaskRecord} from '../data/taskRecord.js';
class TaskCompositionError extends Error {constructor(readonly code:string){super(code);}}
const fail=(code:string):Result<never>=>({ok:false,issues:[{code,path:'task.input',message:'Invalid or oversized normalized task input'}],warnings:[]});
const get=async(v:TaskValue,k:string)=>{for await(const [name,x]of v.properties())if(name===k)return x;return undefined;};
async function small(v:TaskValue):Promise<any>{
 const bytes=await v.byteLength();if(!Number.isSafeInteger(bytes)||bytes<0||bytes>256*1024)throw new TaskCompositionError('LIMIT_EXCEEDED');
 const read=async(x:TaskValue,depth:number):Promise<any>=>{if(depth>64)throw new TaskCompositionError('LIMIT_EXCEEDED');const kind=await x.kind();if(kind==='scalar')return x.scalar();if(kind!=='object')throw new TaskCompositionError('INVALID_DATA');const o:any=Object.create(null);for await(const[k,value]of x.properties())o[k]=await read(value,depth+1);return o;};return read(v,0);
}
const plain=(v:any):any=>v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)])):v;
function marker(v:any):TaskImageResource{
 const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
 if(v?.kind!=='task-image'||v.version!==1)throw new TaskCompositionError('INVALID_DATA');
 if(v.availability==='available'&&uuid.test(v.assetId)&&Object.keys(v).every(k=>['kind','version','availability','assetId'].includes(k)))return v;
 if(v.availability==='unavailable'&&uuid.test(v.findingId)&&/^IMAGE_(SOURCE_MISSING|KEY_NOT_FOUND|UNUSABLE|LIMIT|SOURCE_CONFLICT)$/.test(v.reason)&&Object.keys(v).every(k=>['kind','version','availability','reason','findingId'].includes(k)))return v;
 throw new TaskCompositionError('INVALID_DATA');
}
/** Only the bounded normalized contract is consumed, never legacy PreparedInput. */
export async function composeTaskDocument(template:ValidatedTemplate,input:TaskValue,options:{signal?:AbortSignal}={}):Promise<Result<ResolvedDocument>>{
 const t=template.definition,signal=options.signal,iterators=new Set<AsyncIterator<any>>();
 const check=()=>signal?.throwIfAborted();
 try{
  check();if(await input.kind()!=='object')return fail('INVALID_DATA');
  for await(const[k]of input.properties())if(!['contract','template','data','sections'].includes(k))return fail('INVALID_DATA');
  const contract=await get(input,'contract'),pin=await get(input,'template');if(!contract||!pin||await contract.scalar()!=='flowdoc-task-input/1')return fail('INVALID_DATA');
  if(!isDeepStrictEqual(plain(await small(pin)),{templateId:t.templateId,docKey:t.docKey,version:t.version,fingerprint:template.fingerprint,nodeModelVersion:t.nodeModelVersion}))return fail('INVALID_DATA');
  if(t.sections.length>2000)return fail('LIMIT_EXCEEDED');
  const projected:TaskValue={kind:()=>input.kind(),byteLength:()=>input.byteLength(),scalar:()=>input.scalar(),elements:()=>input.elements(),async *properties(){for await(const[k,v]of input.properties())if(k==='data'||k==='sections')yield[k,v];}};
  let markerBytes=0;const markers=new Map<string,TaskImageResource>();
  const validation=await validateNormalizedTaskInput(template,projected,{...(signal?{signal}:{}),write:async()=>{},images:{collect:async(v,c)=>{check();if(!v)throw new TaskCompositionError('INVALID_DATA');const m=marker(await small(v));markerBytes+=Buffer.byteLength(c.pointer)+256;if(markerBytes>8*1048576)throw new TaskCompositionError('LIMIT_EXCEEDED');markers.set(c.pointer,m);},seal:async()=>{},resolve:async c=>markers.get(c.pointer)!}});
  if(!validation.ok)return validation;markers.clear();
  const global=await get(input,'data'),sectionInput=await get(input,'sections'),sections:any={};if(!global||!sectionInput)return fail('INVALID_DATA');
  const sectionById=new Map<string,TaskValue>();if(t.nodeModelVersion===19)for await(const entry of sectionInput.elements()){const id=await get(entry,'id');sectionById.set(await id!.scalar() as string,entry);}
  for(const s of t.sections){const entry=t.nodeModelVersion===19?sectionById.get(s.id):await get(sectionInput,(s as import('../template/types.js').AreaSection).key);if(!entry)return fail('INVALID_DATA');sections[s.id]={data:await get(entry,'data'),header:await get(entry,'header'),footer:await get(entry,'footer')};}
  const d:ResolvedDocument={schemaVersion:t.schemaVersion,nodeModelVersion:t.nodeModelVersion,template:{templateId:t.templateId,docKey:t.docKey,version:t.version},book:{contentSlot:'body',page:structuredClone(t.pageLayouts[t.book.defaultPageLayoutId]!.page)},styles:structuredClone(t.styles),rootIds:[],nodes:Object.create(null),sourceMap:Object.create(null)};
  const lookup=async(scope:any,key:string):Promise<TaskValue>=>{if(!scope||typeof scope.properties!=='function')throw new TaskCompositionError('INVALID_DATA');const found=await get(scope,key);if(!found)throw new TaskCompositionError('INVALID_DATA');return found;};
  const collection=async(scope:any,key:string,area=false)=>{const list=await lookup(scope,key);if(await list.kind()!=='array')throw new TaskCompositionError('INVALID_DATA');
   const it=(async function*(){let i=0;for await(const record of list.elements()){check();const bytes=await record.byteLength();if(bytes>256*1024)throw new TaskCompositionError('LIMIT_EXCEEDED');const lease=await retainTaskRecord(record);try{if(area){const format=await get(lease.value,'format'),data=await get(lease.value,'data');yield {format:await format!.scalar(),originalIndex:i++,data};}else yield lease.value;}finally{lease.release();}}})();iterators.add(it);return it;
  };
  const scalar=async(scope:any,key:string)=>{const v=await small(await lookup(scope,key));if(v?.kind==='task-image'){const m=marker(v);return m.availability==='available'?m.assetId:'unavailable-'+m.findingId;}return plain(v);};
  const resolve=async(e:BindingEffect):Promise<any>=>{
   check();if(e.kind==='next'){const next=await e.iterator.next();if(next.done)iterators.delete(e.iterator);return next;}
   if(e.kind==='collection'||e.kind==='area')return collection(e.scope,e.key,e.kind==='area');
   const scopes={...e.scopes},refs:any[]=[];const n=e.source;
   if(n.type==='image')refs.push(n.props.source);
   if(n.type==='text-block'){if(n.props.anchorId&&typeof n.props.anchorId==='object')refs.push(n.props.anchorId);for(const c of n.children){if(c.type==='field-ref')refs.push(c);else if(['url','link','reference'].includes(c.type))for(const v of Object.values(c))if(v&&typeof v==='object')refs.push(v);}}
   const values:any={};for(const r of refs){values[r.scope]??=Object.create(null);if(!Object.hasOwn(values[r.scope],r.key))values[r.scope][r.key]=await scalar(e.scopes[r.scope],r.key);}return {...scopes,...values};
  };
  const steps=composeSectionsSteps(t,{data:global,sections} as any,d,new ExpansionBudget(50000));let step=steps.next();try{while(!step.done){step=steps.next(await resolve(step.value));}}finally{steps.return();}
  if(!d.rootIds.some(id=>d.nodes[id]?.type!=='page-break')&&!d.sections?.some(s=>s.role==='cover'||s.sourceKind==='blank'))return fail('EMPTY_CONTENT');
  const issues=validateResolvedDocument(d);return issues.length?{ok:false,issues,warnings:[]}:{ok:true,value:d,warnings:[]};
 }catch(e){if(e instanceof TaskCompositionError)return fail(e.code);if(e instanceof ExpansionLimitError)return fail('EXPANSION_LIMIT');check();return fail('INVALID_DATA');}
 finally{for(const it of iterators)await it.return?.();}
}
