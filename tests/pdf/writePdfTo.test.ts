import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {writePdfTo} from '../../src/pdf/writePdfTo.js';
import {writePdf} from '../../src/pdf/writePdf.js';
const ref=(b:Uint8Array,key:string)=>({key,byteLength:b.length,sha256:createHash('sha256').update(b).digest('hex')});
async function fixture(count=24){
 const jpeg=await readFile('fixtures/images/red.jpg'),rgb=deflateSync(new Uint8Array([255,0,0,0,255,0,0,0,255,255,255,255])),alpha=deflateSync(new Uint8Array([255,128,0,255]));
 const images:any={},files=new Map<string,Uint8Array>();
 for(let i=0;i<count;i++){const b=i%2?rgb:jpeg,key='source'+i;files.set(key,b);images['p'+i]={kind:i%2?'rgb-deflate':'jpeg',width:i%2?2:32,height:i%2?2:16,content:ref(b,key),...(i%2?{alpha:ref(alpha,'alpha'+i)}:{})};if(i%2)files.set('alpha'+i,alpha);}
 let active=0,peak=0;const opened:string[]=[],closed:string[]=[];
 const provider={contract:'flowdoc-pdf-stream/1' as const,images,async *open(r:any){active++;peak=Math.max(peak,active);opened.push(r.key);try{const b=files.get(r.key)!;for(let i=0;i<b.length;i+=17)yield b.subarray(i,i+17);}finally{closed.push(r.key);active--;}}};
 const draw:any={anchors:{last:{pageIndex:count-1,xPt:20,yPt:30}},pages:Array.from({length:count},(_,i)=>({widthPt:595.28,heightPt:841.89,backgroundColor:'FFFFFF',commands:[],images:[{resourceId:'p'+i,nodeId:'i'+i,xPt:20,yPt:50,widthPt:100+i,heightPt:100},{resourceId:'p0',nodeId:'header',xPt:10,yPt:10,widthPt:20,heightPt:10}],...(i===0?{annotations:[{nodeId:'link',linkId:'last',rect:{xPt:20,yPt:20,widthPt:20,heightPt:20},destination:{type:'internal',target:'last'}}]}:{})}))};
 return {provider,draw,opened,closed,peak:()=>peak,active:()=>active};
}
function collector(){const parts:Buffer[]=[];let active=0,peak=0,max=0;return {parts,peak:()=>peak,max:()=>max,async write(b:Uint8Array){active++;peak=Math.max(peak,active);max=Math.max(max,b.length);await new Promise<void>(r=>setImmediate(r));parts.push(Buffer.from(b));active--;}};}
it('streams >20 unique images sequentially with reuse, soft masks and only page-local resources',async()=>{
 const f=await fixture(),sink=collector();const result=await writePdfTo(f.draw,[],f.provider,sink);
 const bytes=Buffer.concat(sink.parts),text=bytes.toString('latin1');expect(result).toMatchObject({byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 expect(f.peak()).toBe(1);expect(f.active()).toBe(0);expect(f.opened).toHaveLength(36);expect(f.closed).toEqual(f.opened);expect(sink.peak()).toBe(1);expect(sink.max()).toBeLessThanOrEqual(65536);
 expect(text.match(/\/Subtype \/Image/g)).toHaveLength(36);expect(text.match(/\/Im1 Do/g)).toHaveLength(25);expect(text).toContain('/SMask');expect(text).toContain('/Dest [49 0 R /XYZ 20 811.89 null]');
 const page0=/3 0 obj\n([\s\S]*?)endobj/.exec(text)![1]!;expect(page0).toContain('/Im1 ');expect(page0).not.toContain('/Im2 ');
 const start=Number(/startxref\n(\d+)/.exec(text)![1]);expect(bytes.subarray(start,start+4).toString()).toBe('xref');
 const table=text.slice(start).split('\n');for(let id=1;id<Number(table[1]!.split(' ')[1]);id++){const offset=Number(table[id+2]!.slice(0,10));expect(bytes.subarray(offset,offset+`${id} 0 obj`.length).toString()).toBe(`${id} 0 obj`);}
});
it('preserves the legacy PDF bytes for text/fonts/links when no images are present',async()=>{
 const f=await fixture(1);f.draw.pages[0].images=[];const sink=collector();await writePdfTo(f.draw,[],{...f.provider,images:{}},sink);expect(Buffer.concat(sink.parts)).toEqual(Buffer.from(writePdf(f.draw,[])));
});
it('stops on changed image bytes, sink failure, abort and output limit without opening later images',async()=>{
 for(const scenario of ['changed','sink','abort','limit']){
  const f=await fixture(3),abort=new AbortController();let writes=0;
  if(scenario==='changed')f.provider.images.p0.content.sha256='0'.repeat(64);
  const sink={async write(){writes++;if(scenario==='sink')throw Error('sink failed');if(scenario==='abort')abort.abort();}};
  await expect(writePdfTo(f.draw,[],f.provider,sink,{signal:abort.signal,...(scenario==='limit'?{maxBytes:200}:{})})).rejects.toThrow();
  expect(f.opened).not.toContain('source1');expect(f.active()).toBe(0);expect(f.closed).toEqual(f.opened);
 }
});
it('includes content in deterministic PDF identity and snapshots provider metadata before output awaits',async()=>{
 const f=await fixture(1),a=collector();const pending=writePdfTo(f.draw,[],f.provider,a);f.provider.images.p0.width=99;f.provider.open=async function*(){throw Error('mutated');};await pending;expect(Buffer.concat(a.parts).toString('latin1')).toContain('/Width 32 /Height 16');
});
it('does not read ahead or build whole-output/image buffers while the sink is blocked',async()=>{
 const f=await fixture(2);let release!:()=>void,blocked!:()=>void;const paused=new Promise<void>(r=>blocked=r),gate=new Promise<void>(r=>release=r);let seen=0;
 const sink={async write(b:Uint8Array){seen++;if(seen===1){blocked();await gate;}}};
 const pending=writePdfTo(f.draw,[],f.provider,sink);await paused;expect(f.opened).toEqual([]);expect(seen).toBe(1);release();await pending;expect(f.peak()).toBe(1);
});
it('changes PDF identity for changed verified bytes and never deduplicates distinct image identities',async()=>{
 const get=async(byte:number)=>{const f=await fixture(2),b=deflateSync(new Uint8Array(12).fill(byte));f.provider.images.p1.content=ref(b,'changed');const original=f.provider.open.bind(f.provider);f.provider.open=async function*(r:any){if(r.key==='changed')yield b;else yield*original(r);};const out=collector();await writePdfTo(f.draw,[],f.provider,out);return Buffer.concat(out.parts).toString('latin1');};
 const a=await get(1),b=await get(2);expect(a.match(/\/ID \[<([^>]+)/)![1]).not.toBe(b.match(/\/ID \[<([^>]+)/)![1]);expect(a.match(/\/Subtype \/Image/g)).toHaveLength(3);
});
it.each(['sink','cancel'])('closes an in-flight image reader on %s before opening the next resource',async scenario=>{
 const f=await fixture(3),abort=new AbortController();
 await expect(writePdfTo(f.draw,[],f.provider,{async write(){if(f.active()){if(scenario==='sink')throw Error('sink failed during image');abort.abort();}}},{signal:abort.signal})).rejects.toThrow();
 expect(f.opened).toEqual(['source0']);expect(f.closed).toEqual(f.opened);expect(f.active()).toBe(0);
});
