import {expect,it} from 'vitest';
import {spawn,execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {resolve} from 'node:path';

const bin=resolve('runtime/linux-x64/flowdoc-icu4x-line-segmenter');
const native=it.runIf(process.platform==='linux');
function frame(value:unknown){const body=Buffer.from(JSON.stringify(value)),h=Buffer.alloc(4);h.writeUInt32BE(body.length);return Buffer.concat([h,body]);}
function serve(){
 const child=spawn(bin,['--serve'],{stdio:['pipe','pipe','ignore']});
 const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
 const exited=once(child,'close');
 return {child,exited,next:async()=>{const v=await lines.next();if(v.done)throw Error('closed before response');return JSON.parse(v.value);}};
}
native('serves Unicode in one process with exact one-shot results, repeated input and fragmented framing',async()=>{
 const s=serve();try{
  expect(await s.next()).toMatchObject({protocol:'flowdoc-segmenter-session/1',segmenterRevision:'icu_segmenter-2.2.0',dataRevision:'icu_segmenter_data-2.2.0'});
  let id=0;
  for(const text of ['ภาษาไทยทดสอบ English words','กำ กิ่ ก๊ café','😀👨‍👩‍👧‍👦𐐀','line\r\nnext\t"\\\u0000','ซ้ำ','ซ้ำ','ภาษาไทย '.repeat(1500)]){
   const message=frame({id:++id,text});s.child.stdin.write(message.subarray(0,2));s.child.stdin.write(message.subarray(2));
   const {id:actual,...value}=await s.next();expect(actual).toBe(id);
   // NUL cannot be an argv value; the other cases compare the original CLI.
   if(!text.includes('\0'))expect(value).toEqual(JSON.parse(execFileSync(process.env.FLOWDOC_LEGACY_SEGMENTER??bin,[text],{encoding:'utf8'})));
   expect(value.text).toBe(text);expect(value.breakByteOffsets[0]).toBe(0);expect(value.breakByteOffsets.at(-1)).toBe(Buffer.byteLength(text));
  }
 }finally{s.child.stdin.end();await s.exited;}
});
native.each([
 Buffer.from([0,0,0,0]),Buffer.from([1,0,0,1]),Buffer.from([0,0,0,5,123]),
 frame({id:0,text:'x'}),frame({id:1,text:''}),frame({id:1,text:'\ud800'}),
 Buffer.from([0,0,0,1,255]),frame({id:1,text:'x',extra:true}),
 Buffer.concat([frame({id:1,text:'x'}),frame({id:1,text:'again'})]),
])('rejects malformed/oversize/truncated/duplicate-id native input',async bytes=>{
 const s=serve();await s.next();s.child.stdin.end(bytes);const [code]=await s.exited;expect(code).not.toBe(0);
});
native('rejects a response that would exceed its wire budget without emitting a partial JSON line',async()=>{
 const s=serve();await s.next();s.child.stdin.end(frame({id:1,text:'x '.repeat(2*1024*1024)}));
 const [code]=await s.exited;expect(code).not.toBe(0);await expect(s.next()).rejects.toThrow(/closed/);
},15000);
