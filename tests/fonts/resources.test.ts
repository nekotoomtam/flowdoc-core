import {it,expect,afterEach} from 'vitest';
import {readFile,writeFile,mkdtemp,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as api from '../../src/fonts/resources.js';
import {createEngine} from '../../src/pdf/createPdfEngine.js';
import {selectFont} from '../../src/fonts/selection.js';
import {document,fakeRuntime} from '../helpers/document.js';
const dirs:string[]=[],sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function fixture(){
 const temp=await mkdtemp(join(tmpdir(),'font-resources-'));dirs.push(temp);const tempRoot=join(temp,'output');await mkdir(tempRoot);
 const bytes=await readFile('assets/fonts/Sarabun-Regular.ttf'),path=join(temp,'source.ttf');await writeFile(path,bytes);
 const license=resolve('assets/fonts/OFL.txt');
 const face:any={releaseId:'20000000-0000-4000-8000-000000000001',faceId:'30000000-0000-4000-8000-000000000001',assetId:'40000000-0000-4000-8000-000000000001',weight:400,style:'normal',path,sha256:sha(bytes),licenses:[{id:'license-one',path:license,sha256:sha(await readFile(license))}]};
 const base:any={tempRoot,pythonExecutable:'python',shaperPath:'shaper',segmenterPath:'segmenter',subsetHelperPath:'subset',fonts:[]};
 return {temp,bytes,path,face,base};
}
it('loads exact static TTF and licenses, includes asset hash in identity, and rejects ambiguous slots',async()=>{
 expect(api.loadLibraryFonts).toBeTypeOf('function');
 const f=await fixture(),r=await api.loadLibraryFonts(f.base,[f.face]);expect(r.ok).toBe(true);
 if(r.ok){expect(r.value.fonts[0]!.id).toContain(f.face.sha256);expect(r.value.fonts[0]!.licenses).toEqual(f.face.licenses);}
 expect(await api.loadLibraryFonts(f.base,[f.face,{...f.face,faceId:'30000000-0000-4000-8000-000000000002'}])).toMatchObject({ok:false,issues:[{code:'FONT_FACE_UNAVAILABLE'}]});
 expect(await api.loadLibraryFonts(f.base,[{...f.face,sha256:'0'.repeat(64)}])).toMatchObject({ok:false,issues:[{code:'FONT_ASSET_HASH_MISMATCH'}]});
 expect(await api.loadLibraryFonts(f.base,[{...f.face,style:'italic'}])).toMatchObject({ok:false,issues:[{code:'FONT_FACE_UNAVAILABLE'}]});
 expect(await api.loadLibraryFonts(f.base,[{...f.face,licenses:[{...f.face.licenses[0],sha256:'0'.repeat(64)}]}])).toMatchObject({ok:false,issues:[{code:'FONT_LICENSE_HASH_MISMATCH'}]});
 await writeFile(f.path,Buffer.from('OTTO invalid'));f.face.sha256=sha(await readFile(f.path));
 expect((await api.loadLibraryFonts(f.base,[f.face])).ok).toBe(false);
});
it('pins private bytes for measurement and subsetting despite caller changing the source after generation starts',async()=>{
 expect(api.loadLibraryFonts).toBeTypeOf('function');
 const f=await fixture(),r=await api.loadLibraryFonts(f.base,[f.face]);expect(r.ok).toBe(true);if(!r.ok)return;
 const d:any=document('abc');d.schemaVersion=2;d.styles.body={font:{kind:'library',releaseId:f.face.releaseId,weight:400,style:'normal'},fontSize:{value:12,unit:'pt'},lineHeightPt:20};
 let copiedPath='',changed=false;
 const engine=createEngine(r.value,{runtime:resources=>{copiedPath=resources.fonts[0]!.path;return {...fakeRuntime,close:async()=>{},fontId:s=>selectFont(s,resources.fonts).id,shape:async(text,...args)=>{if(!changed){changed=true;await writeFile(f.path,'changed externally');}expect(await readFile(copiedPath)).toEqual(f.bytes);return fakeRuntime.shape(text);}};},subset:async(draw,resources)=>{expect(resources.fonts[0]!.path).toBe(copiedPath);expect(await readFile(copiedPath)).toEqual(f.bytes);expect(draw.pages[0]!.commands[0]!.fontId).toBe(resources.fonts[0]!.id);return [];},write:()=>new Uint8Array([1])});
 const result=await engine.generatePdf(d);expect(result.ok,JSON.stringify(result)).toBe(true);expect(copiedPath).not.toBe(f.path);expect(await readdir(f.base.tempRoot)).toEqual([]);
 expect(await engine.generatePdf(d)).toMatchObject({ok:false,issues:[{code:'FONT_ASSET_HASH_MISMATCH'}]});
});
