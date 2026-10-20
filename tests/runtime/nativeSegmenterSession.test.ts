import {it,expect} from 'vitest';
import {NativeSegmenterSession} from '../../src/runtime/nativeSegmenterSession.js';

const hello={protocol:'flowdoc-segmenter-session/1',source:'flowdoc-icu4x-native-line-segmenter',segmenterRevision:'icu_segmenter-2.2.0',dataRevision:'icu_segmenter_data-2.2.0'};
const fixture=(mode='normal')=>String.raw`
const hello=${JSON.stringify(hello)},mode=${JSON.stringify(mode)};
if(mode==='nohello')setInterval(()=>{},1000);else process.stdout.write(JSON.stringify(mode==='old'?{}:hello)+'\n');
let b=Buffer.alloc(0);process.stdin.on('data',c=>{b=Buffer.concat([b,c]);while(b.length>=4&&b.length>=4+b.readUInt32BE()){
const n=b.readUInt32BE(),r=JSON.parse(b.subarray(4,4+n));b=b.subarray(4+n);
if(mode==='hang'){process.on('SIGTERM',()=>{});setInterval(()=>{},1000);continue;}
if(mode==='crash')process.exit(1);
const text=r.text,offsets=[0];let at=0;for(const ch of text){at+=Buffer.byteLength(ch);offsets.push(at);}
const value={id:r.id,...hello,text,textByteLength:Buffer.byteLength(text),textScalarCount:[...text].length,breakByteOffsets:offsets};
if(mode==='mismatch')value.id++;if(mode==='badtext')value.text='other';if(mode==='badrevision')value.dataRevision='other';
if(mode==='offset')value.breakByteOffsets=[0,1,Buffer.byteLength(text)];
if(mode==='duplicate')value.breakByteOffsets=[0,0,Buffer.byteLength(text)];
if(mode==='empty')value.breakByteOffsets=[];
const line=mode==='json'?'bad\n':mode==='utf8'?Buffer.from([255,10]):JSON.stringify(value)+'\n';
if(mode==='extra')process.stdout.write(line+line);else if(mode==='fragment'){const data=Buffer.from(line);for(const byte of data)process.stdout.write(Buffer.from([byte]));}else if(mode==='large')process.stdout.write('x'.repeat(2000));else setTimeout(()=>process.stdout.write(line),5);
}});`;
const make=(mode='normal',limits={},signal?:AbortSignal)=>new NativeSegmenterSession(process.execPath,['-e',fixture(mode)],{limits:{timeout:1500,...limits},signal});
it('reuses one process, FIFO, repeated strings, Unicode and fragmented response bytes',async()=>{
 const s=make('fragment');try{
  const values=await Promise.all(['ก😀','same','same','\n"\\'].map(t=>s.request(t)));
  expect(values).toEqual([[0,1,3],[0,1,2,3,4],[0,1,2,3,4],[0,1,2,3]]);
 }finally{await s.close();await s.close();}
 await expect(s.request('late')).rejects.toThrow();
});
it.each(['old','crash','mismatch','badtext','badrevision','offset','duplicate','empty','json','utf8','extra','large'])('fails session and rejects later requests on %s',async mode=>{
 const s=make(mode,{maxBuffer:1024});try{await expect(s.request('ก😀')).rejects.toThrow();await expect(s.request('again')).rejects.toThrow();}finally{await s.close();}
});
it.each(['nohello','hang'])('times out %s and closes even if TERM is ignored',async mode=>{
 const s=make(mode,{timeout:300,terminateMs:20,killWaitMs:500});try{await expect(s.request('x')).rejects.toThrow(/timed out/);}finally{await s.close();}
});
it('enforces request count, retained text and frame bounds before enqueue; rejection keeps session usable',async()=>{
 const s=make('normal',{maxRequests:1,maxRetainedBytes:12,maxFrame:64});
 try{await expect(s.request('1234567')).rejects.toThrow(/budget/);await expect(s.request('')).rejects.toThrow();await expect(s.request('\ud800')).rejects.toThrow();
  const first=s.request('x');await expect(s.request('y')).rejects.toThrow(/budget/);expect(await first).toEqual([0,1]);
  expect(await s.request('z')).toEqual([0,1]);
 }finally{await s.close();}
 const frame=make('normal',{maxFrame:25});try{await expect(frame.request('\u0000'.repeat(8))).rejects.toThrow(/frame/);}finally{await frame.close();}
});
it('abort rejects active and queued work, closes promptly, and separate generations stay independent',async()=>{
 const abort=new AbortController(),a=make('hang',{terminateMs:20},abort.signal),b=make();
 const pending=Promise.allSettled([a.request('a'),a.request('b')]);
 await new Promise(r=>setTimeout(r,150));abort.abort();expect((await pending).every(v=>v.status==='rejected')).toBe(true);
 await a.close();expect(await b.request('ok')).toEqual([0,1,2]);await b.close();
});
it('rejects already aborted ownership and missing executables without leaking unhandled errors',async()=>{
 const controller=new AbortController();controller.abort();const s=make('normal',{},controller.signal);
 try{await expect(s.request('x')).rejects.toThrow();}finally{await s.close();}
 const missing=new NativeSegmenterSession('flowdoc-missing-segmenter',[]);try{await expect(missing.request('x')).rejects.toThrow();}finally{await missing.close();}
});
