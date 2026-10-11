import {spawn} from 'node:child_process';

/** One font per process. Length-prefixed UTF-8 requests, one JSON line per response. */
export class NativeShapeSession {
 private readonly child;
 private readonly exited:Promise<void>;
 private failure:Error|undefined;
 private pending:{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|undefined;
 private chunks:Buffer[]=[];
 private bytes=0;
 private tail:Promise<unknown>=Promise.resolve();
 constructor(executable:string,args:string[],private readonly limits={timeout:30_000,maxBuffer:16*1024*1024}){
  this.child=spawn(executable,args,{windowsHide:true,stdio:['pipe','pipe','ignore']});
  this.exited=new Promise(resolve=>this.child.once('close',()=>{this.fail(Error('Native shaper closed'));resolve();}));
  this.child.on('error',()=>this.fail(Error('Native shaper unavailable')));
  this.child.stdin.on('error',()=>this.fail(Error('Native shaper input failed')));
  this.child.stdout.on('data',(chunk:Buffer)=>{
   if(!this.pending){this.fail(Error('Unexpected native response'));return;}
   this.bytes+=chunk.length;
   if(this.bytes>this.limits.maxBuffer){this.fail(Error('Native response too large'));return;}
   this.chunks.push(chunk);
   const newline=chunk.indexOf(10);if(newline<0)return;
   if(newline!==chunk.length-1){this.fail(Error('Unexpected native response'));return;}
   try{
    const value=JSON.parse(Buffer.concat(this.chunks,this.bytes).toString('utf8'));
    const pending=this.pending;this.pending=undefined;clearTimeout(pending.timer);this.chunks=[];this.bytes=0;pending.resolve(value);
   }catch{this.fail(Error('Invalid native response'));}
  });
 }
 private fail(error:Error){
  this.failure??=error;
  if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(this.failure);this.pending=undefined;}
  this.chunks=[];this.bytes=0;this.child.kill('SIGKILL');
 }
 request(text:string):Promise<any>{
  if(!text.isWellFormed()||Buffer.byteLength(text)>this.limits.maxBuffer)return Promise.reject(Error('Invalid native input'));
  const run=this.tail.then(()=>{
   if(this.failure)throw this.failure;
   return new Promise((resolve,reject)=>{
    this.pending={resolve,reject,timer:setTimeout(()=>this.fail(Error('Native shaper timed out')),this.limits.timeout)};
    const body=Buffer.from(text),header=Buffer.alloc(4);header.writeUInt32BE(body.length);
    this.child.stdin.write(Buffer.concat([header,body]));
   });
  });
  this.tail=run.catch(()=>{});return run;
 }
 async close():Promise<void>{this.fail(Error('Native session closed'));await this.exited;}
}
