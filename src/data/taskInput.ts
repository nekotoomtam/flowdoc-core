import type {ValidatedTemplate,ObjectSchema,AreaField,ArrayField,StringField,ImageField,LinkField} from '../template/types.js';
import type {Result,Issue} from '../result.js';
import {buildAreaIndex} from '../template/areas.js';
import {validateField} from './validateValues.js';
/** Storage-neutral handles. Containers are traversed; only bounded scalars are read. */
export interface TaskValue {byteLength():Promise<number>;kind():Promise<'object'|'array'|'scalar'>;scalar():Promise<unknown>;properties():AsyncIterable<readonly [string,TaskValue]>;elements():AsyncIterable<TaskValue>}
export interface TaskImageContext {sectionId:string|null;pointer:string;assetDefinition:boolean}
export type TaskImageResource={kind:'task-image';version:1;availability:'available';assetId:string}|{kind:'task-image';version:1;availability:'unavailable';reason:string;findingId:string};
export interface TaskInputLimits {recordBytes:number;maxRecords:number;maxImagePlacements:number}
export interface TaskInputOptions {limits?:Partial<TaskInputLimits>;write:(chunk:string)=>Promise<void>;images:{collect:(value:TaskValue|undefined,context:TaskImageContext)=>Promise<void>;seal:()=>Promise<void>;resolve:(context:TaskImageContext)=>Promise<TaskImageResource>};onWarning?:(issue:Issue)=>Promise<void>;signal?:AbortSignal}
export interface TaskInputSummary {contract:'flowdoc-task-input/1';imagePlacements:number;omittedPlacements:number;warningCount:number}
class InputFailure extends Error {constructor(readonly code:string,readonly path:string){super('Invalid task input');}}
const esc=(k:string)=>k.replaceAll('~','~0').replaceAll('/','~1');
const memory=(v:any):TaskValue=>({async byteLength(){return Buffer.byteLength(JSON.stringify(v));},async kind(){return Array.isArray(v)?'array':v!==null&&typeof v==='object'?'object':'scalar';},async scalar(){return v;},async *properties(){for(const [k,x] of Object.entries(v))yield [k,memory(x)] as const;},async *elements(){for(const x of v)yield memory(x);}});
const get=async(v:TaskValue,k:string)=>{for await(const [name,value] of v.properties())if(name===k)return value;return undefined;};
/** New task contract only. Never broadens legacy object-based prepareGeneration. */
export function normalizeTaskInput(template:ValidatedTemplate,input:TaskValue,options:TaskInputOptions):Promise<Result<TaskInputSummary>>{return walkTaskInput(template,input,options,false);}
// Internal canonical validation for the composition bridge; not a new raw API mode.
export function validateNormalizedTaskInput(template:ValidatedTemplate,input:TaskValue,options:TaskInputOptions):Promise<Result<TaskInputSummary>>{return walkTaskInput(template,input,options,true);}
async function walkTaskInput(template:ValidatedTemplate,input:TaskValue,options:TaskInputOptions,normalized:boolean):Promise<Result<TaskInputSummary>>{
 const t=template.definition,index=buildAreaIndex(t),summary:TaskInputSummary={contract:'flowdoc-task-input/1',imagePlacements:0,omittedPlacements:0,warningCount:0};let collecting=true,records=0,collectedPlacements=0;const defaults:TaskInputLimits={recordBytes:256*1024,maxRecords:100000,maxImagePlacements:10000},limits={...defaults,...options.limits};
 for(const key of Object.keys(defaults) as (keyof TaskInputLimits)[])if(!Number.isSafeInteger(limits[key])||limits[key]<1||limits[key]>defaults[key])return {ok:false,issues:[{code:'LIMIT_EXCEEDED',path:'/limits',message:'Unsupported task bounds'}],warnings:[]};
 const fail=(code:string,path:string):never=>{throw new InputFailure(code,path);};
 const check=()=>options.signal?.throwIfAborted();
 const write=async(s:string)=>{check();if(!collecting)await options.write(s);};
 const scalar=async(v:TaskValue|undefined,path:string)=>{if(!v||await v.kind()!=='scalar')return fail('TYPE_MISMATCH',path);const raw=await v.scalar();if(typeof raw==='string'&&Buffer.byteLength(raw)>65536)fail('LIMIT_EXCEEDED',path);return raw;};
 async function keys(v:TaskValue,path:string,allowed:string[],warnUnknown=false){
  check();if(await v.kind()!=='object')fail('TYPE_MISMATCH',path);const seen=new Set<string>();let bytes=0;
  for await(const [k] of v.properties()){check();bytes+=Buffer.byteLength(k)+64;if(bytes>8*1048576||Buffer.byteLength(k)>256)fail('LIMIT_EXCEEDED',path);if(seen.has(k))fail('INVALID_DATA',path+'/'+esc(k));seen.add(k);
   if(!allowed.includes(k)){if(warnUnknown&&t.nodeModelVersion===18&&!normalized){if(collecting){summary.warningCount++;await options.onWarning?.({code:'UNKNOWN_VARIABLE',path:path+'/'+esc(k),message:'Undeclared variable',action:'ignored'});}}else fail('INVALID_DATA',path+'/'+esc(k));}
  }
 }
 async function record(v:TaskValue,path:string,count=true){const bytes=await v.byteLength();if(!Number.isSafeInteger(bytes)||bytes<0)fail('INVALID_DATA',path);if(bytes>limits.recordBytes)fail('LIMIT_EXCEEDED',path);if(collecting&&count&&++records>limits.maxRecords)fail('LIMIT_EXCEEDED',path);}
 async function link(v:TaskValue,path:string){await record(v,path,false);await keys(v,path,['type','value','text','url','target']);const out:Record<string,unknown>=Object.create(null);for await(const [k,x] of v.properties())out[k]=await scalar(x,path+'/'+esc(k));return out;}
 async function data(schema:ObjectSchema,v:TaskValue|undefined,path:string,sectionId:string|null){
  const source=v??memory({});await keys(source,path,Object.keys(schema.fields),true);await write('{');let first=true;
  for(const [k,f] of Object.entries(schema.fields)){check();if(!first)await write(',');first=false;await write(JSON.stringify(k)+':');const value=await get(source,k),p=path+'/'+esc(k);
   await field(f,value,p,sectionId);
  }await write('}');
 }
 type Field=StringField|ArrayField|ImageField|LinkField|AreaField;
 async function field(f:Field,v:TaskValue|undefined,path:string,sectionId:string|null){
  check();if(f.type==='image'){
   const context={sectionId,pointer:path,assetDefinition:false};if(v&&await v.kind()!=='scalar')await record(v,path,false);if(collecting){if(++collectedPlacements>limits.maxImagePlacements)fail('LIMIT_EXCEEDED',path);await options.images.collect(v,context);return;}
   const r=await options.images.resolve(context),uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
   if(r.kind!=='task-image'||r.version!==1||(r.availability==='available'?!uuid.test(r.assetId):r.availability!=='unavailable'||!/^IMAGE_(SOURCE_MISSING|KEY_NOT_FOUND|UNUSABLE|LIMIT|SOURCE_CONFLICT)$/.test(r.reason)||!uuid.test(r.findingId)))throw Error('Invalid task image adapter result');
   summary.imagePlacements++;if(r.availability==='unavailable')summary.omittedPlacements++;await write(JSON.stringify(r));return;
  }
  if(!v){if(f.required)fail('MISSING_REQUIRED',path);if('default' in f)v=memory(f.default);else if(f.type==='array'||f.type==='area')v=memory([]);else{await write('""');return;}}
  if(f.type==='array'){
   if(await v.kind()!=='array')fail('TYPE_MISMATCH',path);await write('[');let i=0;for await(const x of v.elements()){check();await record(x,path+'/'+i);if(i)await write(',');await data(f.items,x,path+'/'+i++,sectionId);}await write(']');return;
  }
  if(f.type==='area'){
   if(await v.kind()!=='array')fail('TYPE_MISMATCH',path);const a=index.byId.get(f.areaId);if(!a)fail('INVALID_DATA',path);await write('[');let i=0;
   for await(const e of v.elements()){const p=path+'/'+i;await record(e,p);await keys(e,p,['format','data']);const name=await scalar(await get(e,'format'),p+'/format');const format=typeof name==='string'?a!.formatsByKey.get(name):undefined;if(!format)fail('UNKNOWN_FORMAT',p+'/format');const d=await get(e,'data');if(!d)fail('MISSING_REQUIRED',p+'/data');if(i++)await write(',');await write('{"format":'+JSON.stringify(name)+',"data":');await data(format!.format.inputSchema,d,p+'/data',sectionId);await write('}');}await write(']');return;
  }
  const raw=f.type==='link'&&!(normalized&&await v.kind()==='scalar')?await link(v,path):await scalar(v,path),issues:Issue[]=[];const prepared=validateField(f,raw,path,issues,[],normalized?'prepared':'request');if(issues.length)fail(issues[0]!.code,path);await write(JSON.stringify(prepared));
 }
 async function section(s:typeof t.sections[number],entry:TaskValue,path:string){
  await keys(entry,path,t.nodeModelVersion===19?['id','data','header','footer','assets']:['data','header','footer','assets']);
  const assets=await get(entry,'assets');if(assets){if(await assets.kind()!=='array')fail('TYPE_MISMATCH',path+'/assets');if(collecting){let n=0;for await(const a of assets.elements()){check();await record(a,path+'/assets/'+n,false);await options.images.collect(a,{sectionId:s.id,pointer:path+'/assets/'+n++,assetDefinition:true});}}}
  await write('{');if(t.nodeModelVersion===19)await write('"id":'+JSON.stringify(s.id)+',');await write('"data":');await data(s.inputSchema,await get(entry,'data'),path+'/data',s.id);
  for(const band of ['header','footer'] as const){const v=await get(entry,band);if(s[band]){await write(','+JSON.stringify(band)+':');await data(s[band]!.inputSchema,v,path+'/'+band,s.id);}else if(v){if(t.nodeModelVersion===19)fail('INVALID_DATA',path+'/'+band);await keys(v,path+'/'+band,[],true);}}
  await write('}');
 }
 async function walk(){
  await keys(input,'',['data','sections','meta']);const raw=await get(input,'sections');
  const entries=new Map<string,{value:TaskValue;path:string}>();
  if(t.nodeModelVersion===19){if(!raw||await raw.kind()!=='array')fail('SECTION_INPUT_SHAPE','/sections');let i=0;for await(const e of raw!.elements()){const p='/sections/'+i++;if(await e.kind()!=='object')fail('SECTION_INPUT_SHAPE',p);const rawId=await scalar(await get(e,'id'),p+'/id');if(typeof rawId!=='string')fail('SECTION_ID_REQUIRED',p+'/id');const id=rawId as string;if(entries.has(id))fail('SECTION_INPUT_DUPLICATE',p+'/id');if(!t.sections.some(s=>s.id===id))fail('SECTION_INPUT_UNKNOWN',p+'/id');if(!await get(e,'data'))fail('MISSING_REQUIRED',p+'/data');entries.set(id,{value:e,path:p});}
   for(const s of t.sections)if(!entries.has(s.id))fail('SECTION_INPUT_MISSING','/sections/'+s.id);
  }else{const v=raw??memory({});await keys(v,'/sections',t.sections.map(s=>s.key));for(const s of t.sections)entries.set(s.id,{value:await get(v,s.key)??memory({}),path:'/sections/'+esc(s.key)});}
  await write('{"contract":"flowdoc-task-input/1","template":'+JSON.stringify({templateId:t.templateId,docKey:t.docKey,version:t.version,fingerprint:template.fingerprint,nodeModelVersion:t.nodeModelVersion})+',"data":');await data(t.globalSchema,await get(input,'data'),'/data',null);await write(',"sections":'+(t.nodeModelVersion===19?'[':'{'));let i=0;
  for(const s of t.sections){if(i++)await write(',');if(t.nodeModelVersion===18)await write(JSON.stringify('key' in s?s.key:'')+':');const e=entries.get(s.id)!;await section(s,e.value,e.path);}await write(t.nodeModelVersion===19?']}': '}}');
 }
 try{await walk();await options.images.seal();collecting=false;await walk();return {ok:true,value:summary,warnings:[]};}
 catch(e){if(e instanceof InputFailure)return {ok:false,issues:[{code:e.code,path:e.path,message:'Invalid task input'}],warnings:[]};throw e;}
}
