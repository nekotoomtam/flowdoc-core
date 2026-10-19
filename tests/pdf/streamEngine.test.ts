import {it,expect,vi} from 'vitest';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createEngine} from '../../src/pdf/createPdfEngine.js';
import {writePdf} from '../../src/pdf/writePdf.js';
import {document,fakeRuntime} from '../helpers/document.js';
import {contentsDocument} from '../helpers/contents.js';
import * as flow from '../../src/layout/documentFlow.js';
const empty=()=>({contract:'flowdoc-pdf-stream/1' as const,images:{},async *open(){throw Error('unexpected read');}});
async function setup(){const tempRoot=await mkdtemp(join(tmpdir(),'stream-engine-'));const font=await readFile('assets/fonts/Sarabun-Regular.ttf');const close=vi.fn(async()=>{});const engine=createEngine({tempRoot,fonts:[]} as any,{runtime:()=>({...fakeRuntime,close}),subset:async()=>[{fontId:'font-regular',subsetBytes:font,subsetPrefix:'FDTEST',postScriptName:'FlowDocTest'}],write:writePdf});return {tempRoot,engine,close};}
function sink(){const parts:Buffer[]=[],abort=vi.fn(async()=>{});return {parts,abort,async write(c:Uint8Array){parts.push(Buffer.from(c));}};}
it('exports a bounded receipt through the engine and matches legacy TOC, links and page-field output',async()=>{
 const s=await setup();try{const d=contentsDocument(30);d.sections[0].footer={baseTextStyleId:'body',rootIds:['page'],nodes:{page:{id:'page',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'current',type:'system-page-field',field:'current',width:{value:24,unit:'pt'}}]}},sourceMap:{page:{origin:'authored',sectionId:'main',sourceId:'page'},current:{origin:'authored',sectionId:'main',sourceId:'current'}}};
 const out=sink(),result=await s.engine.generatePdfTo(d,empty(),out);expect(result.ok).toBe(true);if(!result.ok)throw Error(JSON.stringify(result));const legacy=await s.engine.generatePdf(d);expect(legacy.ok).toBe(true);if(!legacy.ok)throw Error(JSON.stringify(legacy));
 const bytes=Buffer.concat(out.parts);expect(bytes).toEqual(Buffer.from(legacy.value.bytes));expect(result.value).toMatchObject({byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),mediaType:'application/pdf',pageCount:legacy.value.pageCount});expect(result.value).not.toHaveProperty('bytes');expect(out.abort).not.toHaveBeenCalled();expect(s.close).toHaveBeenCalledTimes(2);expect(await readdir(s.tempRoot)).toEqual([]);
 }finally{await rm(s.tempRoot,{recursive:true,force:true});}
});
it('snapshots document/provider before the first await and lays out only dimensions',async()=>{
 const s=await setup(),spy=vi.spyOn(flow,'documentFlow');try{
 const d:any=document();d.nodes.t={id:'t',type:'image',props:{resourceId:'photo',width:{value:100,unit:'pt'},height:{value:100,unit:'pt'}}};delete d.sourceMap.leaf;
 const b=await readFile('fixtures/images/red.jpg');const p:any={contract:'flowdoc-pdf-stream/1',images:{photo:{kind:'jpeg',width:32,height:16,content:{key:'original',byteLength:b.length,sha256:createHash('sha256').update(b).digest('hex')}}},async *open(){yield b;}};
 const out=sink(),pending=s.engine.generatePdfTo(d,p,out);d.nodes.t.props.height.value=900;p.images.photo.width=90;p.open=async function*(){throw Error('changed');};expect((await pending).ok).toBe(true);
 expect(spy.mock.calls[0]![2]).toEqual({photo:{width:32,height:16}});
 }finally{spy.mockRestore();await rm(s.tempRoot,{recursive:true,force:true});}
});
it.each(['sink','cancel','limit','resource','invalid'])('aborts partial output and closes runtime on %s failure',async scenario=>{
 const s=await setup();try{const out=sink(),abort=new AbortController(),p:any=empty();let writes=0;
 out.write=async()=>{writes++;if(scenario==='sink')throw Error('/private/path');if(scenario==='cancel')abort.abort();};if(scenario==='resource')p.contract='bad';
 const d:any=document();if(scenario==='invalid')d.nodes.t.type='unknown';const result=await s.engine.generatePdfTo(d,p,out,{signal:abort.signal,...(scenario==='limit'?{maxBytes:100}:{})});
 expect(result.ok).toBe(false);expect(out.abort).toHaveBeenCalledTimes(1);expect(JSON.stringify(result)).not.toContain('/private');expect(await readdir(s.tempRoot)).toEqual([]);if(writes)expect(s.close).toHaveBeenCalledTimes(1);
 }finally{await rm(s.tempRoot,{recursive:true,force:true});}
});
it('keeps legacy image-count protection while the new negotiated path accepts 21',async()=>{
 const s=await setup();try{const images=Object.fromEntries(Array.from({length:21},(_,i)=>['p'+i,{kind:'rgb' as const,width:1,height:1,bytes:new Uint8Array(3)}]));expect(await s.engine.generatePdf(document(),images)).toMatchObject({ok:false,issues:[{code:'INVALID_IMAGE_RESOURCE'}]});const out=sink();expect((await s.engine.generatePdfTo(document(),empty(),out)).ok).toBe(true);}finally{await rm(s.tempRoot,{recursive:true,force:true});}
});
it('rejects a graph above the task node bound before cloning or starting a runtime',async()=>{
 const s=await setup();try{const d:any=document();d.nodes=Object.fromEntries(Array.from({length:50001},(_,i)=>['i'+i,{id:'i'+i,type:'page-break',props:{}}]));const out=sink();expect(await s.engine.generatePdfTo(d,empty(),out)).toMatchObject({ok:false,issues:[{code:'TASK_COMPOSITION_LIMIT'}]});expect(s.close).not.toHaveBeenCalled();expect(out.parts).toHaveLength(0);}finally{await rm(s.tempRoot,{recursive:true,force:true});}
});
it('enforces page limit while layout is running instead of retaining excess pages',async()=>{
 const d:any=document();d.nodes.t={id:'t',type:'image',props:{resourceId:'missing',width:{value:20,unit:'pt'},height:{value:700,unit:'pt'}}};d.nodes.u={...structuredClone(d.nodes.t),id:'u'};d.rootIds.push('u');
 await expect(flow.documentFlow(d,fakeRuntime,{}, {maxPages:1})).rejects.toThrow('Page limit exceeded');
});
