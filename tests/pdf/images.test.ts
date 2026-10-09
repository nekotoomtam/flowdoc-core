import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {writePdf} from '../../src/pdf/writePdf.js';
function imageDoc(){const d:any=document();d.nodeModelVersion=5;d.nodes.t={id:'t',type:'image',props:{width:{value:200,unit:'pt'},height:{value:100,unit:'pt'},resourceId:'photo'}};return d;}
const resources={photo:{kind:'rgb',width:2,height:2,bytes:new Uint8Array([255,0,0,0,255,0,0,0,255,255,255,255]),alpha:new Uint8Array([255,128,0,255])}};
it('aligns frames inside printable width while keeping the image centered within each frame',async()=>{
 const left=20*72/25.4,available=(210-40)*72/25.4;
 for(const [align,offset] of [[undefined,0],['left',0],['center',(available-200)/2],['right',available-200]] as const){
  const d=imageDoc();if(align)d.nodes.t.props.align=align;expect(validateResolvedDocument(d)).toEqual([]);
  const image=(await documentFlow(d,fakeRuntime,resources as any)).pages[0].images![0];expect(image.xPt).toBeCloseTo(left+offset+50);expect(image.yPt).toBeCloseTo(left);
 }
 const d=imageDoc();d.nodes.t.props.align='justify';expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
it('retains right frame alignment after a whole-frame page break',async()=>{
 const d=imageDoc();d.nodes.t.props.height.value=450;d.nodes.u=structuredClone(d.nodes.t);d.nodes.u.id='u';d.nodes.u.props.align='right';d.rootIds.push('u');
 const pages=(await documentFlow(d,fakeRuntime,resources as any)).pages;expect(pages).toHaveLength(2);expect(pages[1].images![0].xPt).toBeCloseTo((210-20)*72/25.4-200);
});
it('accepts version 5 image roots while rejecting images under version 4 and inside cells',()=>{const d=imageDoc();expect(validateResolvedDocument(d)).toEqual([]);d.nodeModelVersion=4;expect(validateResolvedDocument(d).length).toBeGreaterThan(0);});
it('fits proportionally inside the authored frame and embeds RGB plus soft mask',async()=>{const d=imageDoc();const draw=await documentFlow(d,fakeRuntime,resources as any);expect(draw.pages[0].images[0]).toMatchObject({resourceId:'photo',widthPt:100,heightPt:100});const pdf=Buffer.from(writePdf(draw,[],resources as any)).toString('latin1');expect(pdf).toContain('/Subtype /Image');expect(pdf).toContain('/SMask');expect(pdf).toContain('/Im1 Do');});
it('moves whole frames across pages and rejects over-page frames',async()=>{const d=imageDoc();d.nodes.t.props.height.value=450;d.nodes.u=structuredClone(d.nodes.t);d.nodes.u.id='u';d.rootIds.push('u');d.sourceMap.u={contentIndex:1,format:'photo',sourceId:'u'};expect((await documentFlow(d,fakeRuntime,resources as any)).pages).toHaveLength(2);d.nodes.t.props.height.value=1000;await expect(documentFlow(d,fakeRuntime,resources as any)).rejects.toThrow();});
it('keeps the frame when no resource is available',async()=>{const d=imageDoc();d.nodes.u=structuredClone(d.nodes.t);d.nodes.u.id='u';d.nodes.u.props.resourceId='missing';d.rootIds.unshift('u');const draw=await documentFlow(d,fakeRuntime,resources as any);expect(draw.pages[0].images).toHaveLength(1);expect(draw.pages[0].images[0].yPt).toBeCloseTo(20*72/25.4+100);});
import {validateImageResources} from '../../src/pdf/imageResources.js';
import {createEngine} from '../../src/pdf/createPdfEngine.js';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it('rejects malformed RGB, alpha, pixel budgets and mismatched JPEG dimensions',async()=>{expect(()=>validateImageResources({p:{kind:'rgb',width:2,height:2,bytes:new Uint8Array(1)}})).toThrow();expect(()=>validateImageResources({p:{...resources.photo,alpha:new Uint8Array(1)} as any})).toThrow();expect(()=>validateImageResources({p:{...resources.photo,width:9_000_000} as any})).toThrow();const bytes=await readFile('fixtures/images/red.jpg');expect(()=>validateImageResources({p:{kind:'jpeg',width:32,height:16,bytes}})).not.toThrow();expect(()=>validateImageResources({p:{kind:'jpeg',width:33,height:16,bytes}})).toThrow();});
it('embeds JPEG once for repeated references',async()=>{const d=imageDoc();d.nodes.u={...d.nodes.t,id:'u'};d.rootIds.push('u');const map={photo:{kind:'jpeg',width:32,height:16,bytes:await readFile('fixtures/images/red.jpg')}};const pdf=Buffer.from(writePdf(await documentFlow(d,fakeRuntime,map as any),[],map as any)).toString('latin1');expect(pdf.match(/\/Subtype \/Image/g)).toHaveLength(1);expect(pdf.match(/\/Im1 Do/g)).toHaveLength(2);expect(pdf).toContain('/DCTDecode');});
it('public engine warns for missing images and rejects invalid prepared data',async()=>{const tempRoot=await mkdtemp(join(tmpdir(),'images-engine-'));const engine=createEngine({tempRoot} as any,{runtime:fakeRuntime,subset:async()=>[],write:writePdf});const d=imageDoc();expect(await engine.generatePdf(d)).toMatchObject({ok:true,warnings:[{code:'IMAGE_UNAVAILABLE',nodeId:'t'}]});expect(await engine.generatePdf(d,{photo:{...resources.photo,bytes:new Uint8Array(1)}} as any)).toMatchObject({ok:false,issues:[{code:'INVALID_IMAGE_RESOURCE'}]});});
it('changes PDF identity when image content changes without geometry changes',async()=>{const d=imageDoc(),draw=await documentFlow(d,fakeRuntime,resources as any);const a=Buffer.from(writePdf(draw,[],resources as any)).toString('latin1').match(/\/ID \[<([^>]+)/)?.[1];const changed=structuredClone(resources);changed.photo.bytes[0]=3;const b=Buffer.from(writePdf(draw,[],changed as any)).toString('latin1').match(/\/ID \[<([^>]+)/)?.[1];expect(a).not.toBe(b);});
it('rejects a JPEG with incomplete SOF and no scan',()=>{expect(()=>validateImageResources({p:{kind:'jpeg',width:1,height:1,bytes:new Uint8Array([255,216,255,192,0,8,8,0,1,0,1,3,255,217])}})).toThrow();});
it('snapshots exact byte views and detaches shared storage',async()=>{for(const backing of [new ArrayBuffer(1000000),new SharedArrayBuffer(1000000)]){const bytes=new Uint8Array(backing,100,3);bytes.set([1,2,3]);const tempRoot=await mkdtemp(join(tmpdir(),'images-snapshot-'));let captured:any;const engine=createEngine({tempRoot} as any,{runtime:fakeRuntime,subset:async()=>[],write:(_d,_f,map)=>{captured=map;return new Uint8Array([1]);}});const pending=engine.generatePdf(imageDoc(),{photo:{kind:'rgb',width:1,height:1,bytes}});bytes[0]=9;expect((await pending).ok).toBe(true);expect(captured.photo.bytes.buffer.byteLength).toBe(3);expect(captured.photo.bytes[0]).toBe(1);}});
