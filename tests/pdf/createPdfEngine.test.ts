import {it,expect,afterEach} from 'vitest';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEngine} from '../../src/pdf/createPdfEngine.js';
import {document,fakeRuntime} from '../helpers/document.js';
import type {ExportResources} from '../../src/runtime/exportResources.js';
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function setup(){const tempRoot=await mkdtemp(join(tmpdir(),'flowdoc-engine-'));dirs.push(tempRoot);return {tempRoot,pythonExecutable:'python',shaperPath:'shaper',segmenterPath:'segmenter',subsetHelperPath:'subset',fonts:[]} as ExportResources;}
it('uses separate temporary directories for overlapping calls and cleans both',async()=>{
 const r=await setup(),seen:string[]=[];
 const engine=createEngine(r,{runtime:fakeRuntime,subset:async(_d,_r,temp)=>{seen.push(temp);await writeFile(join(temp,'test'),'x');await new Promise(resolve=>setTimeout(resolve,5));return [];},write:()=>new Uint8Array([1])});
 const results=await Promise.all([engine.generatePdf(document()),engine.generatePdf(document('other'))]);
 expect(results.every(r=>r.ok)).toBe(true);expect(new Set(seen).size).toBe(2);expect(await readdir(r.tempRoot)).toEqual([]);
});
it.each(['shape','subset','writer'])('maps %s failure and removes temp files',async stage=>{
 const r=await setup();const crash=()=>{throw Error('/secret/internal-path');};
 const runtime=stage==='shape'?{...fakeRuntime,shape:async()=>crash()}:fakeRuntime;
 const engine=createEngine(r,{runtime,subset:async(_d,_r,temp)=>{await writeFile(join(temp,'partial'),'x');if(stage==='subset')crash();return [];},write:stage==='writer'?crash:()=>new Uint8Array([1])});
 const result=await engine.generatePdf(document());expect(result.ok).toBe(false);
 if(!result.ok){expect(result.issues[0]!.code).toBe(stage==='writer'?'PDF_RENDER_FAILED':'RESOURCE_UNAVAILABLE');expect(JSON.stringify(result)).not.toContain('/secret');}
 expect(await readdir(r.tempRoot)).toEqual([]);
});
it('rejects unsupported nodes before native work',async()=>{
 const r=await setup();const engine=createEngine(r,{runtime:fakeRuntime,subset:async()=>{throw Error('must not run');},write:()=>new Uint8Array()});
 const d:any=document();d.nodes.t.type='table';const result=await engine.generatePdf(d);
 expect(result.ok).toBe(false);if(!result.ok)expect(result.issues[0]!.code).toBe('LAYOUT_FAILED');expect(await readdir(r.tempRoot)).toEqual([]);
 const malformed:any=document();malformed.nodes.t.props.textStyleId={toString:null,valueOf:null};
 await expect(engine.generatePdf(JSON.parse(JSON.stringify(malformed)))).resolves.toMatchObject({ok:false,issues:[{code:'LAYOUT_FAILED'}]});
});
