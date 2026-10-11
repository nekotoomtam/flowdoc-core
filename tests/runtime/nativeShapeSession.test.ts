import {it,expect} from 'vitest';
import {NativeShapeSession} from '../../src/runtime/nativeShapeSession.js';
const echo=`let b=Buffer.alloc(0);process.stdin.on('data',c=>{b=Buffer.concat([b,c]);while(b.length>=4&&b.length>=4+b.readUInt32BE()){let n=b.readUInt32BE(),s=b.subarray(4,4+n).toString();b=b.subarray(4+n);process.stdout.write(JSON.stringify({text:s,pid:process.pid})+'\\n');}});`;
it('reuses a process and preserves Unicode, newlines and concurrent request ordering',async()=>{
 const s=new NativeShapeSession(process.execPath,['-e',echo]);
 try{const values=await Promise.all(['ก\n"\\𐐀','next'].map(t=>s.request(t)));expect(values.map(v=>v.text)).toEqual(['ก\n"\\𐐀','next']);expect(values[0].pid).toBe(values[1].pid);}finally{await s.close();}
 await expect(s.request('late')).rejects.toThrow();
});
it.each(['process.exit(1)','process.stdout.write("bad\\n")','process.stdout.write("x".repeat(200))','setInterval(()=>{},1000)'])('fails boundedly and closes on bad worker: %s',async code=>{
 const s=new NativeShapeSession(process.execPath,['-e',code],{timeout:300,maxBuffer:100});
 try{await expect(s.request('test')).rejects.toThrow();await expect(s.request('again')).rejects.toThrow();}finally{await s.close();}
});
it('rejects missing executables without unhandled child errors',async()=>{const s=new NativeShapeSession('flowdoc-does-not-exist',[]);try{await expect(s.request('x')).rejects.toThrow();}finally{await s.close();}});
it('closing rejects an in-flight request and kills a worker even if it ignores TERM',async()=>{
 const s=new NativeShapeSession(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"]);
 const pending=expect(s.request('x')).rejects.toThrow();
 await new Promise(r=>setTimeout(r,150));await s.close();await pending;
});
