import {execFileSync,spawnSync} from 'node:child_process';
import {strict as assert} from 'node:assert';
import {resolve} from 'node:path';
import {NativeShapeSession} from '../dist/runtime/nativeShapeSession.js';
const executable=resolve('runtime/linux-x64/flowdoc-rustybuzz-smoke');
for(const face of ['Regular','Bold','Italic','BoldItalic']){
 const font=resolve(`assets/fonts/Sarabun-${face}.ttf`),id=`test-${face}`;
 const session=new NativeShapeSession(executable,['--serve',font,id]);
 try{
  for(const text of ['ระบบรับข้อมูลผู้ขอ ชื่อโครงการ และรายการเอกสาร','REQ-001 (................) Page 99 of 10','กิ่ กำ น้ำ ทดสอบ\nบรรทัด\t"quote" \\','long '.repeat(1000)]){
   const oneShot=JSON.parse(execFileSync(executable,[font,text,id],{encoding:'utf8',maxBuffer:16*1024*1024}));
   assert.deepEqual(await session.request(text),oneShot);
  }
 }finally{await session.close();}
}
const font=resolve('assets/fonts/Sarabun-Regular.ttf');
for(const input of [Buffer.from([0,0]),Buffer.from([1,0,0,1]),Buffer.from([0,0,0,2,65]),Buffer.from([0,0,0,1,255])]){
 const result=spawnSync(executable,['--serve',font,'test'],{input,timeout:3000});
 assert.equal(result.status,1);
}
assert.equal(spawnSync(executable,['--serve',font,'test'],{input:Buffer.alloc(0),timeout:3000}).status,0);
console.log('Native session: 16 exact one-shot comparisons; malformed frames and EOF passed');
