import {spawn} from 'node:child_process';
import {TextDecoder} from 'node:util';

const source='flowdoc-icu4x-native-line-segmenter';
const revision='icu_segmenter-2.2.0',dataRevision='icu_segmenter_data-2.2.0';
const defaults={timeout:30_000,maxFrame:16*1024*1024,maxBuffer:16*1024*1024,maxRequests:8,maxRetainedBytes:32*1024*1024,terminateMs:1000,killWaitMs:2000};
type Request={id:number;text:string;bytes:number;resolve:(value:number[])=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};

function validIdentity(raw:any){return raw?.source===source&&raw.segmenterRevision===revision&&raw.dataRevision===dataRevision;}
function offsets(raw:any,text:string,id:number):number[]{
 const length=Buffer.byteLength(text);
 if(!validIdentity(raw)||raw.id!==id||raw.text!==text||raw.textByteLength!==length||!Array.isArray(raw.breakByteOffsets))throw Error('Mismatched segmenter response');
 const values=raw.breakByteOffsets;
 if(values[0]!==0||values.at(-1)!==length||values.some((n:unknown,i:number)=>!Number.isSafeInteger(n)||(i>0&&values[i-1]>=Number(n))))throw Error('Invalid break offsets');
 // Convert in place while walking scalars, avoiding a per-character Map/array.
 let b=0,u=0,index=1,scalars=0;
 for(const ch of text){b+=Buffer.byteLength(ch);u+=ch.length;scalars++;
  if(index<values.length&&values[index]<b)throw Error('Invalid break offsets');
  if(values[index]===b)values[index++]=u;
 }
 if(index!==values.length||raw.textScalarCount!==scalars)throw Error('Invalid segmenter scalar count');
 return values;
}
// Exact JSON string byte count without allocating an oversized escaped string.
function stringBytes(text:string){let bytes=2;for(const ch of text){const c=ch.codePointAt(0)!;bytes+=c===34||c===92||[8,9,10,12,13].includes(c)?2:c<32?6:Buffer.byteLength(ch);}return bytes;}

/** A generation owns this session. At most one native roundtrip is active. */
export class NativeSegmenterSession {
 private readonly child;
 private readonly exited:Promise<void>;
 private readonly limits:typeof defaults;
 private resolveExit!:()=>void;
 private ended=false;
 private failure:Error|undefined;
 private ready=false;
 private draining=false;
 private sequence=0;
 private retainedBytes=0;
 private queue:Request[]=[];
 private active:Request|undefined;
 private chunks:Buffer[]=[];
 private received=0;
 private startup:ReturnType<typeof setTimeout>|undefined;
 private killTimer:ReturnType<typeof setTimeout>|undefined;
 private readonly signal:AbortSignal|undefined;
 private readonly abort=()=>this.fail(Error('Segmenter cancelled'));
 private readonly drain=()=>{this.draining=false;this.pump();};
 constructor(executable:string,args:string[]=['--serve'],options:{signal?:AbortSignal|undefined;limits?:Partial<typeof defaults>}={}){
  this.limits={...defaults,...options.limits};
  if(Object.values(this.limits).some(n=>!Number.isSafeInteger(n)||n<=0))throw Error('Invalid segmenter limits');
  this.signal=options.signal;
  this.exited=new Promise(resolve=>{this.resolveExit=resolve;});
  this.child=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','ignore']});
  this.startup=setTimeout(()=>this.fail(Error('Segmenter startup timed out')),this.limits.timeout);
  this.child.on('error',()=>this.fail(Error('Segmenter unavailable')));
  this.child.once('close',()=>{
   this.ended=true;clearTimeout(this.killTimer);this.fail(Error('Segmenter closed'));this.resolveExit();
  });
  this.child.stdin.on('error',()=>this.fail(Error('Segmenter input failed')));
  this.child.stdout.on('error',()=>this.fail(Error('Segmenter output failed')));
  this.child.stdout.on('data',(chunk:Buffer)=>this.receive(chunk));
  this.signal?.addEventListener('abort',this.abort,{once:true});
  if(this.signal?.aborted)this.abort();
 }
 private receive(chunk:Buffer){
  if(this.failure)return;
  const limit=this.ready?this.limits.maxBuffer:1024;
  if(this.received+chunk.length>limit){this.fail(Error('Segmenter response too large'));return;}
  const newline=chunk.indexOf(10);
  if(newline>=0&&newline!==chunk.length-1){this.fail(Error('Unexpected segmenter response'));return;}
  this.chunks.push(chunk);this.received+=chunk.length;if(newline<0)return;
  try{
   let raw:any;
   try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(this.chunks,this.received)));}catch{throw Error('Invalid segmenter response');}
   this.chunks=[];this.received=0;
   if(!this.ready){
    if(!validIdentity(raw)||raw.protocol!=='flowdoc-segmenter-session/1')throw Error('Incompatible segmenter protocol');
    this.ready=true;clearTimeout(this.startup);this.startup=undefined;this.pump();return;
   }
   const request=this.active;if(!request)throw Error('Unexpected segmenter response');
   const value=offsets(raw,request.text,request.id);
   this.active=undefined;clearTimeout(request.timer);this.retainedBytes-=request.bytes;
   request.resolve(value);this.pump();
  }catch(error){this.fail(error instanceof Error?error:Error('Invalid segmenter response'));}
 }
 request(text:string):Promise<number[]>{
  if(this.failure)return Promise.reject(this.failure);
  if(!text||!text.isWellFormed())return Promise.reject(Error('Invalid segmenter input'));
  const bytes=text.length*2;
  if(this.queue.length+Number(!!this.active)>=this.limits.maxRequests||this.retainedBytes+bytes>this.limits.maxRetainedBytes)return Promise.reject(Error('Segmenter request budget exceeded'));
  const id=this.sequence+1;
  if(!Number.isSafeInteger(id)||stringBytes(text)+Buffer.byteLength(`{"id":${id},"text":}`)>this.limits.maxFrame)return Promise.reject(Error('Segmenter request frame too large'));
  this.sequence=id;this.retainedBytes+=bytes;
  return new Promise((resolve,reject)=>{
   this.queue.push({id,text,bytes,resolve,reject,timer:setTimeout(()=>this.fail(Error('Segmenter request timed out')),this.limits.timeout)});
   this.pump();
  });
 }
 private pump(){
  if(!this.ready||this.failure||this.active||this.draining)return;
  const request=this.queue.shift();if(!request)return;this.active=request;
  const body=Buffer.from(JSON.stringify({id:request.id,text:request.text})),header=Buffer.alloc(4);header.writeUInt32BE(body.length);
  // The frame bound was checked before retaining the request.
  try{
   if(!this.child.stdin.write(Buffer.concat([header,body]))){this.draining=true;this.child.stdin.once('drain',this.drain);}
  }catch{this.fail(Error('Segmenter input failed'));}
 }
 private fail(error:Error){
  if(this.failure)return;this.failure=error;
  clearTimeout(this.startup);this.startup=undefined;
  this.signal?.removeEventListener('abort',this.abort);this.child.stdin.removeListener('drain',this.drain);
  for(const request of [...(this.active?[this.active]:[]),...this.queue]){clearTimeout(request.timer);request.reject(error);}
  this.active=undefined;this.queue=[];this.retainedBytes=0;this.chunks=[];this.received=0;
  if(!this.ended){this.child.kill('SIGTERM');this.killTimer=setTimeout(()=>this.child.kill('SIGKILL'),this.limits.terminateMs);}
 }
 async close():Promise<void>{
  this.fail(Error('Segmenter session closed'));
  if(this.ended)return;
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{await Promise.race([this.exited,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Segmenter cleanup unconfirmed')),this.limits.terminateMs+this.limits.killWaitMs);})]);}
  finally{clearTimeout(timer);}
 }
}
