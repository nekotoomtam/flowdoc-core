import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import * as api from '../../src/pdf/streamResources.js';
const ref=(b:Uint8Array,key='owned')=>({key,byteLength:b.length,sha256:createHash('sha256').update(b).digest('hex')});
async function check(b:Uint8Array,kind:'jpeg'|'rgb-deflate',width:number,height:number,overrides:any={}){
 const image={kind,width,height,content:ref(b),...overrides};
 const provider={contract:'flowdoc-pdf-stream/1' as const,images:{p:image},async *open(){for(let i=0;i<b.length;i+=7)yield b.subarray(i,i+7);}};
 const pin=api.snapshotImageProvider(provider);
 let bytes=0;for await(const c of api.verifiedImageStream(pin,pin.images.p!,false))bytes+=c.length;return bytes;
}
it('verifies chunk-split JPEG and zlib RGB without collecting a decoded raster',async()=>{
 const jpg=await readFile('fixtures/images/red.jpg');expect(await check(jpg,'jpeg',32,16)).toBe(jpg.length);
 const rgb=deflateSync(new Uint8Array(3*32*16));expect(await check(rgb,'rgb-deflate',32,16)).toBe(rgb.length);
});
it('rejects corrupt hashes, lengths, dimensions, truncated JPEG and bad compressed representations',async()=>{
 const jpg=await readFile('fixtures/images/red.jpg');
 for(const overrides of [{content:{...ref(jpg),sha256:'0'.repeat(64)}},{content:{...ref(jpg),byteLength:jpg.length+1}},{width:33}])await expect(check(jpg,'jpeg',32,16,overrides)).rejects.toThrow();
 await expect(check(jpg.subarray(0,-2),'jpeg',32,16)).rejects.toThrow();
 for(const b of [deflateSync(new Uint8Array(10)),new Uint8Array([1,2,3]),Buffer.concat([deflateSync(new Uint8Array(12)),Buffer.from('trailing')])])await expect(check(b,'rgb-deflate',2,2)).rejects.toThrow();
});
it('supports over 20 metadata entries and detaches manifest and adapter functions before await',()=>{
 const b=deflateSync(new Uint8Array(12)),images=Object.fromEntries(Array.from({length:24},(_,i)=>['p'+i,{kind:'rgb-deflate' as const,width:2,height:2,content:ref(b,'source'+i)}]));
 const open=async function*(){yield b;},provider={contract:'flowdoc-pdf-stream/1' as const,images,open};const pin=api.snapshotImageProvider(provider);
 images.p0!.width=4;images.p0!.content.sha256='0'.repeat(64);provider.open=async function*(){throw Error('mutated');};
 expect(pin.images.p0!.width).toBe(2);expect(pin.images.p0!.content.sha256).toBe(ref(b).sha256);expect(Object.keys(pin.images)).toHaveLength(24);
});
it('bounds provider chunks and closes the active iterator on failure or cancellation',async()=>{
 const b=deflateSync(new Uint8Array(12));let closed=0;
 const provider={contract:'flowdoc-pdf-stream/1' as const,images:{p:{kind:'rgb-deflate' as const,width:2,height:2,content:ref(b)}},async *open(){try{yield new Uint8Array(65537);}finally{closed++;}}};
 const pin=api.snapshotImageProvider(provider);await expect((async()=>{for await(const _ of api.verifiedImageStream(pin,pin.images.p!,false)){} })()).rejects.toThrow();expect(closed).toBe(1);
 const abort=new AbortController();abort.abort();await expect((async()=>{for await(const _ of api.verifiedImageStream(pin,pin.images.p!,false,abort.signal)){} })()).rejects.toThrow();
});
it('rejects invalid metadata before opening any source',()=>{
 const b=deflateSync(new Uint8Array(12));const p:any={contract:'flowdoc-pdf-stream/1',images:{p:{kind:'rgb-deflate',width:2,height:2,content:ref(b)}},open:async function*(){throw Error('must not open');}};
 for(const mutate of [(x:any)=>x.contract='old',(x:any)=>x.images.p.width=8_000_001,(x:any)=>x.images.p.content.sha256='bad',(x:any)=>x.images.p.content.byteLength=0,(x:any)=>x.images.p.alpha=ref(b,'owned')]){const input={...p,images:structuredClone(p.images)};mutate(input);expect(()=>api.snapshotImageProvider(input)).toThrow();}
});
it('rejects non-metadata before cloning any caller-owned raster',()=>{
 const bytes=new Uint8Array(1000000),p:any={contract:'flowdoc-pdf-stream/1',images:{p:{kind:'rgb-deflate',width:2,height:2,content:ref(new Uint8Array([1])),bytes}},open:async function*(){}};
 const original=structuredClone,clone=vi.spyOn(globalThis,'structuredClone').mockImplementation((value:any)=>{if(value===p.images)throw Error('raster cloned');return original(value);});
 try{expect(()=>api.snapshotImageProvider(p)).toThrow('Invalid image metadata');}finally{clone.mockRestore();}
});
