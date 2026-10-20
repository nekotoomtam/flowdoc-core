import {it,expect} from 'vitest';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createTextRuntime} from '../../src/runtime/textRuntime.js';
import {NativeSegmenterSession} from '../../src/runtime/nativeSegmenterSession.js';
const native=it.runIf(process.platform==='linux');
const bin=resolve('runtime/linux-x64/flowdoc-icu4x-line-segmenter');
native('runtime reuses the real serving helper, keeps breaks unchanged and rejects use after close',async()=>{
 const runtime=createTextRuntime({segmenterPath:bin,fonts:[]} as any);
 try{for(const text of ['ภาษาไทย English','😀 กำ ก๊\nnext','same','same']){
  const raw=JSON.parse(execFileSync(bin,[text],{encoding:'utf8'}));
  const expected=raw.breakByteOffsets.map((b:number)=>Buffer.from(text).subarray(0,b).toString('utf8').length);
  expect(await runtime.breaks(text)).toEqual(expected);
 }}finally{await runtime.close();await runtime.close();}
 await expect(runtime.breaks('late')).rejects.toThrow();
});
native('closes an owned real child and rejects old native capability without hanging',async()=>{
 const session=new NativeSegmenterSession(bin);await session.request('ก');
 const pid=(session as any).child.pid;
 await session.close();expect(()=>process.kill(pid,0)).toThrow();
 const old=process.env.FLOWDOC_LEGACY_SEGMENTER;if(!old)throw Error('Explicit legacy helper required');
 const incompatible=new NativeSegmenterSession(old);
 try{await expect(incompatible.request('ก')).rejects.toThrow(/protocol/);}finally{await incompatible.close();}
});
