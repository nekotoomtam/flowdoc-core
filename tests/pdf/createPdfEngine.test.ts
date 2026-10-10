import {contentsDocument} from '../helpers/contents.js';
import * as flow from '../../src/layout/documentFlow.js';
import {it,expect,afterEach,vi} from 'vitest';
import {mkdtemp,readdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEngine} from '../../src/pdf/createPdfEngine.js';
import {document,fakeRuntime} from '../helpers/document.js';
import type {ExportResources} from '../../src/runtime/exportResources.js';
import {sectionTemplate,composed} from '../helpers/sections.js';
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function setup(){const tempRoot=await mkdtemp(join(tmpdir(),'flowdoc-engine-'));dirs.push(tempRoot);return {tempRoot,pythonExecutable:'python',shaperPath:'shaper',segmenterPath:'segmenter',subsetHelperPath:'subset',fonts:[]} as ExportResources;}
it('attributes page-number space failure to the failing section rather than the TOC',async()=>{
 const t=sectionTemplate(),f=t.sections[0].source.fragment;
 f.rootIds=['toc'];f.nodes={toc:{id:'toc',type:'table-of-contents',props:{textStyleId:'body'}}};
 t.formats['section-note'].fragment.nodes.note.props.anchorId='heading';t.formats['section-note'].fragment.nodes.note.props.toc={level:1};
 t.pageLayouts.wide.page.margin.bottom={value:0,unit:'pt'};
 const d=composed(t),engine=createEngine(await setup(),{runtime:fakeRuntime,subset:async()=>[],write:()=>new Uint8Array()});
 const result=await engine.generatePdf(d);expect(result).toMatchObject({ok:false,issues:[{code:'LAYOUT_FAILED',sectionId:'main',nodeId:d.sections![1]!.rootIds[0]}]});
});
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
it('preserves node identity for malformed graph properties',async()=>{
 const r=await setup(),engine=createEngine(r,{runtime:fakeRuntime,subset:async()=>{throw Error('must not run');},write:()=>new Uint8Array()});
 const bad:any=document();bad.nodes.t.props.extra=true;
 await expect(engine.generatePdf(bad)).resolves.toMatchObject({ok:false,issues:[{code:'LAYOUT_FAILED',nodeId:'t'}]});
});
it('returns structured failures for deep invalid graphs',async()=>{
 const r=await setup(),engine=createEngine(r,{runtime:fakeRuntime,subset:async()=>{throw Error('must not run');},write:()=>new Uint8Array()});
 const deep:any=document();deep.nodes={};deep.rootIds=['n0'];deep.sourceMap={n0:{contentIndex:0,format:'bad',sourceId:'n0'}};
 for(let i=0;i<10000;i++)deep.nodes['n'+i]={id:'n'+i,type:'table-cell',props:{},childIds:i<9999?['n'+(i+1)]:[]};
 await expect(engine.generatePdf(deep)).resolves.toMatchObject({ok:false,issues:expect.arrayContaining([expect.objectContaining({code:'LAYOUT_FAILED'})])});
});

it('lays out contents exactly once and fills linked numbers before subsetting',async()=>{
 const spy=vi.spyOn(flow,'documentFlow'),r=await setup();let seen=false;
 try{const engine=createEngine(r,{runtime:fakeRuntime,subset:async(draw)=>{seen=true;expect(draw.contentsSlots).toBeUndefined();expect(draw.anchors?.h0).toBeDefined();expect(draw.pages[0]!.commands.some(c=>c.id==='contents-number-0')).toBe(true);expect(draw.pages[0]!.commands.at(-1)!.id).toBe('page-number-0');return [];},write:()=>new Uint8Array([1])});expect((await engine.generatePdf(contentsDocument(3))).ok).toBe(true);expect(seen).toBe(true);expect(spy).toHaveBeenCalledTimes(1);}finally{spy.mockRestore();}
});
