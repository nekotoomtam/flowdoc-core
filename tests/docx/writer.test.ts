import {it,expect,vi} from 'vitest';
import {Packer} from 'docx';
import JSZip from 'jszip';
import {imageDocument,imageProvider} from './imageFixtures.js';
import {readFileSync} from 'node:fs';
import {preflightDocx,deriveExportIntent} from '../../src/docx/profile.js';
import {writeDocx} from '../../src/docx/writer.js';
function privateFonts(){return {images:[],fonts:fonts().fonts.map((f,i)=>({id:f.id,legacyAlias:['regular','bold','italic','boldItalic'][i] as any,weight:i===1||i===3?700:400,style:i>=2?'italic' as const:'normal' as const,bytes:readFileSync(f.path),sha256:f.sha256,license:{bytes:readFileSync(f.licenses[0]!.path),sha256:f.licenses[0]!.sha256}}))};}
import {createDocxEngine} from '../../src/index.js';
import {fonts,staged,composedFixture,noImages} from './helpers.js';
it('reports the same sink failure code to the caller and staging cleanup',async()=>{
 const engine=await createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));const reasons:string[]=[];
 const result=await engine.value.generateDocxTo(composedFixture(),noImages,{async write(){throw Error('sink failed');},async abort(code){reasons.push(code);}});
 expect(result).toMatchObject({ok:false,issues:[{code:'DOCX_SERIALIZATION_FAILED'}]});expect(reasons).toEqual(['DOCX_SERIALIZATION_FAILED']);
});
it.each([NaN,Infinity,-1,0.1,32*1024*1024+1,null])('rejects invalid maxBytes %s before image streams open',async maxBytes=>{
 const engine=await createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));const sink=staged(),p=imageProvider();const result=await engine.value.generateDocxTo(imageDocument(),p.provider,sink.output,{maxBytes:maxBytes as number});
 expect(result).toMatchObject({ok:false,issues:[{code:'DOCX_INPUT_INVALID'}]});expect(sink.chunks).toEqual([]);expect(p.opened).toEqual([]);
});
it.each(['unknown','array','signal'])('rejects %s options without writes',async kind=>{
 const e=await createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const s=staged();expect(await e.value.generateDocxTo(composedFixture(),noImages,s.output,(kind==='array'?[]:kind==='signal'?{signal:{aborted:false}}:{maxOutputBytes:999999999}) as any)).toMatchObject({ok:false,issues:[{code:'DOCX_INPUT_INVALID'}]});expect(s.chunks).toEqual([]);expect(s.aborts).toHaveLength(1);
});
it('enforces output byte budget before any staged write',async()=>{
 const e=await createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const s=staged();expect(await e.value.generateDocxTo(composedFixture(),noImages,s.output,{maxBytes:1})).toMatchObject({ok:false,issues:[{code:'DOCX_OUTPUT_BUDGET_EXCEEDED'}]});expect(s.chunks).toEqual([]);expect(s.aborts).toEqual(['DOCX_OUTPUT_BUDGET_EXCEEDED']);
});
it('preserves the primary failure when cleanup also fails, and calls cleanup once',async()=>{
 const e=await createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));let aborts=0;const r=await e.value.generateDocxTo(composedFixture(),noImages,{async write(){throw Error('write failed');},async abort(){aborts++;throw Error('abort failed');}});
 expect(r).toMatchObject({ok:false,issues:[{code:'DOCX_SERIALIZATION_FAILED'},{code:'DOCX_CLEANUP_FAILED'}]});expect(aborts).toBe(1);
});
it.each(['before','image','packing','write'])('cancels at %s and clears staging',async phase=>{
 const e=await createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const controller=new AbortController(),s=staged(),p=imageProvider();
 if(phase==='before')controller.abort();
 if(phase==='image'){const original=p.provider.open.bind(p.provider);p.provider.open=async function*(r,signal){for await(const b of original(r,signal)){controller.abort();yield b;}};}
 let spy:ReturnType<typeof vi.spyOn>|undefined;
 if(phase==='packing'){const original=Packer.toBuffer.bind(Packer);spy=vi.spyOn(Packer,'toBuffer').mockImplementation(async(...args)=>{const bytes=await original(...args);controller.abort();return bytes;});}
 if(phase==='write'){const original=s.output.write;s.output.write=async b=>{await original(b);controller.abort();};}
 try{const r=await e.value.generateDocxTo(phase==='image'?imageDocument():composedFixture(),phase==='image'?p.provider:noImages,s.output,{signal:controller.signal});expect(r).toMatchObject({ok:false,issues:[{code:'DOCX_CANCELLED'}]});expect(s.chunks).toEqual([]);expect(s.aborts).toEqual(['DOCX_CANCELLED']);expect(p.closed).toEqual(p.opened);}finally{spy?.mockRestore();}
});
it('pins document, provider metadata, options and output methods before asynchronous image work',async()=>{
 const resources=fonts(),pending=createDocxEngine(resources);resources.fonts[0]!.sha256='0'.repeat(64);const e=await pending;if(!e.ok)throw Error(JSON.stringify(e));
 const d=imageDocument(),p=imageProvider(),s=staged(),options={maxBytes:32*1024*1024},original=p.provider.open.bind(p.provider);
 p.provider.open=async function*(ref,signal){for await(const b of original(ref,signal)){d.rootIds=[];p.image.width=999;options.maxBytes=1;s.output.write=async()=>{throw Error('caller replaced output');};yield b;}};
 const r=await e.value.generateDocxTo(d,p.provider,s.output,options);expect(r.ok,JSON.stringify(r)).toBe(true);const zip=await JSZip.loadAsync(Buffer.concat(s.chunks));expect(await zip.file('word/document.xml')!.async('string')).toContain('<w:drawing>');
});
it.each([1,100])('enforces private model/expanded XML package budget %s before output',async maxPackageNodes=>{
 const p=preflightDocx(composedFixture(),privateFonts());if(!p.ok)throw Error(JSON.stringify(p));const i=deriveExportIntent(p.value);if(!i.ok)throw Error(JSON.stringify(i));const s=staged();let commits=0;
 const r=await writeDocx(i.value,{...s.output,async commit(){commits++;}},{maxPackageNodes});expect(r).toMatchObject({ok:false,issues:[{code:'DOCX_OUTPUT_BUDGET_EXCEEDED'}]});expect(s.chunks).toEqual([]);expect(commits).toBe(0);
});
it('rejects accessors before evaluating caller-defined getters',async()=>{
 const e=await createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const d=composedFixture(),s=staged();let evaluated=false;Object.defineProperty(d,'nodes',{enumerable:true,get(){evaluated=true;throw Error('getter');}});
 expect(await e.value.generateDocxTo(d,noImages,s.output)).toMatchObject({ok:false,issues:[{code:'DOCX_INPUT_INVALID'}]});expect(evaluated).toBe(false);expect(s.chunks).toEqual([]);
});
