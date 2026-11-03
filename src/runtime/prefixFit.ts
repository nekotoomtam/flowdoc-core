import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import type {TextRuntime} from '../layout/textFlow.js';
import type {FontResource} from './exportResources.js';

// Private capability registry: document/client fields cannot provide certificates.
interface Certificate {ready:true;alphabet:string;allowed:Uint8Array;unitsPerEm:number;maxAdvanceUnits:number;minAdvanceUnits:number;maxAbsXPlacementUnits:number;minInkLeftUnits:number;maxInkRightUnits:number; fontSha256:string;work:number}
interface Owner {check():void;fonts:readonly FontResource[];controller:AbortController;certificates:Map<string,Certificate>;queries:number;invalid:boolean;configured:boolean;compiling:Promise<void>|undefined}
const owners=new WeakMap<TextRuntime,{owner:Owner;charge:(work:number)=>boolean}>();
export function registerPrefixOwner(runtime:TextRuntime,fonts:readonly FontResource[],check:()=>void,signal?:AbortSignal){
 owners.set(runtime,{owner:{check,fonts,controller:new AbortController(),certificates:new Map(),queries:0,invalid:false,configured:false,compiling:undefined},charge:()=>false});
}
export function invalidatePrefixOwner(runtime:TextRuntime){const v=owners.get(runtime);if(v){v.owner.invalid=true;v.owner.certificates.clear();v.owner.controller.abort();}}
export async function closePrefixOwner(runtime:TextRuntime){invalidatePrefixOwner(runtime);await owners.get(runtime)?.owner.compiling?.catch(()=>{});}
export function withPrefixBudget(owner:TextRuntime,wrapper:TextRuntime,charge:(work:number)=>boolean):TextRuntime{
 const v=owners.get(owner);if(v)owners.set(wrapper,{owner:v.owner,charge});return wrapper;
}
function compile(executable:string,font:FontResource,alphabet:string,signal:AbortSignal|undefined):Promise<unknown>{
 return new Promise((resolve,reject)=>{
  let exited:Promise<void>;
  const child=execFile(executable,['-I',fileURLToPath(new URL('../../runtime/python/prefixFit.py',import.meta.url))],{timeout:15000,maxBuffer:65536,windowsHide:true,killSignal:'SIGKILL'},(error,stdout)=>{
   // Abort can invoke execFile's callback before the OS child has closed.
   // Runtime.close must not resolve while the compiler still owns a font file.
   void exited.then(()=>{if(error){reject(error);return;}try{resolve(JSON.parse(stdout));}catch(e){reject(e);}});
  });
  const abort=()=>{child.kill('SIGKILL');};
  exited=new Promise(done=>child.once('close',()=>{signal?.removeEventListener('abort',abort);done();}));
  // execFile's killSignal governs its timeout, not spawn's AbortSignal path.
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.stdin?.on('error',()=>{});
  child.stdin?.end(JSON.stringify({fontPath:font.path,sha256:font.sha256,alphabet}));
 });
}
/** Only called for the DOCX owner's already snapshotted font files. */
export async function configurePrefixFit(runtime:TextRuntime,pythonExecutable:string,alphabet:string){
 const entry=owners.get(runtime);if(!entry)return;const o=entry.owner;o.check();
 if(o.configured){await o.compiling;o.check();return;}o.configured=true;
 alphabet=[...new Set(alphabet)].sort().join('');
 if(!pythonExecutable||alphabet.length<1||alphabet.length>95||!/^[\x20-\x7e]+$/.test(alphabet)||o.fonts.length>8)return;
 o.compiling=(async()=>{for(const font of o.fonts){
  o.check();let c:any;
  try{c=await compile(pythonExecutable,font,alphabet,o.controller.signal);}catch{o.check();if(o.invalid)return;continue;}
  o.check();
  if(o.invalid||!c||c.ready!==true||c.fontSha256!==font.sha256||c.alphabet!==alphabet||c.kind!=='r0-ascii-closure-glyf-gpos-bound-v1')continue;
  const metrics=[c.unitsPerEm,c.maxAdvanceUnits,c.minAdvanceUnits,c.maxAbsXPlacementUnits,c.minInkLeftUnits,c.maxInkRightUnits,c.work];
  if(metrics.some(x=>!Number.isSafeInteger(x))||c.unitsPerEm<16||c.unitsPerEm>16384||c.minAdvanceUnits<0||c.maxAdvanceUnits<c.minAdvanceUnits||c.maxAdvanceUnits>1000000||c.maxAbsXPlacementUnits<0||c.maxAbsXPlacementUnits>1000000||Math.abs(c.minInkLeftUnits)>1000000||Math.abs(c.maxInkRightUnits)>1000000||c.work<0||c.work>1000000)continue;
  const allowed=new Uint8Array(128);for(const ch of alphabet)allowed[ch.charCodeAt(0)]=1;
  o.certificates.set(font.id,Object.freeze({...c,allowed}));
 }})();await o.compiling;
}
const bits=new DataView(new ArrayBuffer(8));
function up(n:number){if(!Number.isFinite(n)||n<0)return Infinity;if(n===0)return Number.MIN_VALUE;bits.setFloat64(0,n);bits.setBigUint64(0,bits.getBigUint64(0)+1n);return bits.getFloat64(0);}
export async function tryPrefixFit(runtime:TextRuntime,text:string,fontId:string,size:number,frame:number,epsilon:number):Promise<boolean>{
 const v=owners.get(runtime);if(!v)return false;const {owner:o,charge}=v;
 // The exact same check precedes native requests, including failures already
 // observed on an otherwise idle native session. No independent abort policy.
 o.check();
 const c=o.certificates.get(fontId);
 if(o.invalid||runtime.spacingProbe||!c||!Number.isFinite(frame)||frame<=0||!Number.isFinite(epsilon)||epsilon<0||!Number.isFinite(size)||size<=0||size>512||!Number.isInteger(size*2)||text.length<1||text.length>4096||o.queries>=8192)return false;
 if(!charge(2*text.length+8))return false;o.queries++;
 for(let i=0;i<text.length;i++)if(c.allowed[text.charCodeAt(i)]!==1)return false;
 const scale=size/c.unitsPerEm,a=up(c.maxAdvanceUnits*scale),ink=up((c.maxAbsXPlacementUnits+Math.max(0,c.maxInkRightUnits))*scale),left=up((c.maxAbsXPlacementUnits+Math.max(0,-c.minInkLeftUnits))*scale);
 let cursor=0,prior=0;for(let i=0;i<text.length;i++){prior=cursor;cursor=up(cursor+a);}
 const upper=up(Math.max(cursor,up(prior+ink))+left);
 return Number.isFinite(upper)&&upper<=frame+epsilon;
}
