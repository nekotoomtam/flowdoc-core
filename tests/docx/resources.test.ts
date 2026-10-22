import {describe,it,expect} from 'vitest';
import JSZip from 'jszip';
import {createRequire} from 'node:module';
import {createDocxEngine} from '../../src/index.js';
import {fonts,staged} from './helpers.js';
import {imageDocument,imageProvider,imageId} from './imageFixtures.js';
import {readFile,writeFile,mkdtemp,rm,truncate} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {afterEach} from 'vitest';
import {loadLibraryFonts,validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {sectionTemplate} from '../helpers/sections.js';
import {sha} from './imageFixtures.js';
const PNG=createRequire(import.meta.url)('pngjs').PNG;
describe('DOCX prepared image bridge',()=>{
 it.each([false,true])('preserves verified JPEG bytes and authored frame, band=%s',async band=>{
  const engine=await createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));
  const d=imageDocument(band),before=JSON.stringify(d),p=imageProvider(),sink=staged();
  const r=await engine.value.generateDocxTo(d,p.provider,sink.output);expect(r.ok,JSON.stringify(r)).toBe(true);
  const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks)),name=Object.keys(zip.files).find(n=>/word\/media\/.*\.jpe?g$/.test(n));expect(name).toBeDefined();
  expect(await zip.file(name!)!.async('nodebuffer')).toEqual(p.content);
  const xml=(await Promise.all(Object.keys(zip.files).filter(n=>/word\/(document|header\d+)\.xml$/.test(n)).map(n=>zip.file(n)!.async('string')))).join('');
  expect(xml).toContain('cx="1270000" cy="762000"');expect(p.opened).toEqual(['colour']);expect(p.closed).toEqual(p.opened);expect(JSON.stringify(d)).toBe(before);
 });
 it.each([false,true])('converts verified RGB planes to exact PNG pixels, alpha=%s',async alpha=>{
  const engine=await createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));const p=imageProvider('rgb-deflate',alpha),sink=staged();
  const r=await engine.value.generateDocxTo(imageDocument(),p.provider,sink.output);expect(r.ok,JSON.stringify(r)).toBe(true);
  const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks)),name=Object.keys(zip.files).find(n=>/word\/media\/.*\.png$/.test(n));
  const png=PNG.sync.read(await zip.file(name!)!.async('nodebuffer'));expect([png.width,png.height]).toEqual([2,1]);expect([...png.data]).toEqual([255,0,0,255,0,255,0,alpha?64:255]);expect(p.closed).toEqual(p.opened);
 });
 it('rejects wrong hashes without staged output',async()=>{
  const engine=await createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));const p=imageProvider();p.image.content.sha256='0'.repeat(64);const sink=staged();
  const r=await engine.value.generateDocxTo(imageDocument(),p.provider,sink.output);expect(r).toMatchObject({ok:false,issues:[{code:'DOCX_RESOURCE_INVALID'}]});expect(sink.chunks).toEqual([]);expect(p.closed).toEqual(p.opened);
 });
 it.each(['pixels','bytes'])('rejects excessive %s metadata before opening any stream',async kind=>{
  const engine=await createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));const p=imageProvider();if(kind==='pixels'){p.image.width=4000001;p.image.height=1;}else p.image.content.byteLength=16*1024*1024+1;const sink=staged();
  const r=await engine.value.generateDocxTo(imageDocument(),p.provider,sink.output);expect(r).toMatchObject({ok:false,issues:[{code:'DOCX_OUTPUT_BUDGET_EXCEEDED'}]});expect(p.opened).toEqual([]);expect(sink.chunks).toEqual([]);
 });
});

const dirs:string[]=[];
afterEach(async()=>{for(const p of dirs.splice(0))await rm(p,{recursive:true,force:true});});
async function temp(){const p=await mkdtemp(join(tmpdir(),'docx-font-test-'));dirs.push(p);return p;}
it.each(['font','license'])('rejects incorrect %s hash at engine creation',async kind=>{
 const r=fonts();if(kind==='font')r.fonts[0]!.sha256='0'.repeat(64);else r.fonts[0]!.licenses[0]!.sha256='0'.repeat(64);
 expect(await createDocxEngine(r)).toMatchObject({ok:false,issues:[{code:kind==='font'?'FONT_ASSET_HASH_MISMATCH':'FONT_LICENSE_HASH_MISMATCH'}]});
});
it.each(['truncated','restricted','bitmap'])('rejects %s font with otherwise correct hash',async kind=>{
 const r=fonts(),bytes=await readFile(r.fonts[0]!.path);let out=bytes;
 if(kind==='truncated')out=bytes.subarray(0,100);
 else for(let i=0;i<bytes.readUInt16BE(4);i++){const at=12+i*16;if(bytes.toString('ascii',at,at+4)==='OS/2')bytes.writeUInt16BE(kind==='restricted'?2:512,bytes.readUInt32BE(at+8)+8);}
 const path=join(await temp(),'font.ttf');await writeFile(path,out);r.fonts[0]!.path=path;r.fonts[0]!.sha256=sha(out);expect((await createDocxEngine(r)).ok).toBe(false);
});
it('checks every license hash, not only the first',async()=>{
 const r=fonts();r.fonts[0]!.licenses.push({...r.fonts[0]!.licenses[0]!,id:'second',sha256:'0'.repeat(64)});expect(await createDocxEngine(r)).toMatchObject({ok:false,issues:[{code:'FONT_LICENSE_HASH_MISMATCH'}]});
});
it('rejects a font over the byte cap before reading it',async()=>{
 const path=join(await temp(),'large.ttf');await writeFile(path,'');await truncate(path,17*1024*1024);const r=fonts();r.fonts[0]!.path=path;
 expect(await createDocxEngine(r)).toMatchObject({ok:false,issues:[{code:'DOCX_OUTPUT_BUDGET_EXCEEDED'}]});
});
it('enforces the aggregate font/license resource cap',async()=>{
 const path=join(await temp(),'license.txt'),bytes=Buffer.alloc(1024*1024,32);bytes.write('License evidence for resource budget test');await writeFile(path,bytes);const r=fonts();r.fonts[0]!.licenses=Array.from({length:17},(_,i)=>({id:'test-'+i,path,sha256:sha(bytes)}));
 expect(await createDocxEngine(r)).toMatchObject({ok:false,issues:[{code:'DOCX_OUTPUT_BUDGET_EXCEEDED'}]});
});
it.each(['truncated','malformed','extra','alpha-truncated'])('rejects %s image streams and closes handles',async kind=>{
 const engine=await createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));const p=imageProvider('rgb-deflate',true),sink=staged(),original=p.provider.open.bind(p.provider);
 p.provider.open=async function*(ref,signal){try{if(kind==='alpha-truncated'&&ref.key!=='alpha'){yield* original(ref,signal);return;}for await(const b of original(ref,signal)){yield kind==='malformed'?Buffer.alloc(b.length,255):kind==='extra'?Buffer.concat([b,Buffer.from([1])]):b.subarray(0,b.length-1);}}finally{}};
 const result=await engine.value.generateDocxTo(imageDocument(),p.provider,sink.output);expect(result).toMatchObject({ok:false,issues:[{code:'DOCX_RESOURCE_INVALID'}]});expect(sink.chunks).toEqual([]);expect(p.closed).toEqual(p.opened);
});
it.each(['Sarabun','BaiJamjuree'])('accepts actual Core library selection for %s without fabricated legacy release IDs',async family=>{
 const releaseId='20000000-0000-4000-8000-000000000001',path=resolve(family==='Sarabun'?'assets/fonts/Sarabun-Regular.ttf':'tests/docx/fixtures/BaiJamjuree/BaiJamjuree-Regular.ttf');
 const license=resolve(family==='Sarabun'?'assets/fonts/OFL.txt':'tests/docx/fixtures/BaiJamjuree/OFL.txt');
 const base={...fonts(),tempRoot:await temp(),pythonExecutable:process.execPath,shaperPath:process.execPath,segmenterPath:process.execPath,subsetHelperPath:process.execPath};
 const resources=await loadLibraryFonts(base,[{releaseId,faceId:'30000000-0000-4000-8000-000000000001',assetId:'40000000-0000-4000-8000-000000000001',weight:400,style:'normal',path,sha256:sha(await readFile(path)),licenses:[{id:'OFL-1.1',path:license,sha256:sha(await readFile(license))}]}]);
 expect(resources.ok,JSON.stringify(resources)).toBe(true);if(!resources.ok)return;
 const t=sectionTemplate();t.sections=[t.sections[0]];t.areaFormats={};t.schemaVersion=2;
 for(const key of Object.keys(t.styles))t.styles[key]={font:{kind:'library',releaseId,weight:400,style:'normal'},fontSize:{value:12,unit:'pt'},lineHeightPt:20};
 const v=validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));const p=prepareGeneration(v.value,{docKey:t.docKey,data:{projectName:'English ไทย'},sections:{}});if(!p.ok)throw Error(JSON.stringify(p));const d=composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));
 const engine=await createDocxEngine(resources.value);if(!engine.ok)throw Error(JSON.stringify(engine));const sink=staged(),before=JSON.stringify(d.value);
 const result=await engine.value.generateDocxTo(d.value,{contract:'flowdoc-pdf-stream/1',images:{},async *open(){throw Error('unexpected');}},sink.output);
 expect(result.ok,JSON.stringify(result)).toBe(true);const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));expect(await zip.file('word/fontTable.xml')!.async('string')).toContain(family==='BaiJamjuree'?'Bai Jamjuree':family);expect(JSON.stringify(d.value)).toBe(before);
});
it.each([10001,50001])('rejects %s source image nodes by reference/node cap before opening streams',async count=>{
 const e=await createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const d=imageDocument(),first=Object.values(d.nodes)[0]!,source=d.sourceMap[first.id]!,p=imageProvider(),s=staged();
 d.nodes={};d.sourceMap={};d.rootIds=[];d.sections![0]!.rootIds=d.rootIds;
 for(let i=0;i<count;i++){const id='image-'+i;d.rootIds.push(id);d.nodes[id]={...first,id};d.sourceMap[id]={...source};}
 const r=await e.value.generateDocxTo(d,p.provider,s.output);expect(r).toMatchObject({ok:false,issues:[{code:'DOCX_OUTPUT_BUDGET_EXCEEDED'}]});expect(p.opened).toEqual([]);expect(s.chunks).toEqual([]);
});
