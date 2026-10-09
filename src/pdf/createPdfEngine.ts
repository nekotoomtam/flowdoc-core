import {resolveLinkGeometry} from '../layout/linkGeometry.js';
import {mkdtemp,rm,readFile,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {Result} from '../result.js';
import type {ResolvedDocument} from '../composition/resolvedDocument.js';
import {validateResolvedDocument} from '../composition/validateResolvedDocument.js';
import type {ExportResources} from '../runtime/exportResources.js';
import {probeRuntime} from '../runtime/probeRuntime.js';
import {createTextRuntime} from '../runtime/textRuntime.js';
import {subsetFonts} from '../runtime/subsetFonts.js';
import {LayoutError} from '../layout/textFlow.js';
import {documentFlow} from '../layout/documentFlow.js';
import type {TextRuntime} from '../layout/textFlow.js';
import {writePdf} from './writePdf.js';
import {validateImageResources,snapshotImageResources} from './imageResources.js';
import type {PdfImageResources} from './imageResources.js';
export interface PdfArtifact {bytes:Uint8Array;mediaType:'application/pdf';pageCount:number}
export interface PdfEngine {generatePdf(document:ResolvedDocument,images?:PdfImageResources):Promise<Result<PdfArtifact>>}
interface Dependencies {runtime:TextRuntime;subset:typeof subsetFonts;write:typeof writePdf}
const fail=(code:string,message:string):Result<never>=>({ok:false,issues:[{code,path:'document',message}],warnings:[]});
export function createEngine(resources:ExportResources,deps:Dependencies):PdfEngine{
 return {async generatePdf(input,imageInput={}){
  const issues=validateResolvedDocument(input);if(issues.length)return {ok:false,issues,warnings:[]};
  // Snapshot before the first await so caller mutation cannot change a running job.
  const document=structuredClone(input);
  let images:PdfImageResources;
  try{validateImageResources(imageInput);images=snapshotImageResources(imageInput);}catch{return fail('INVALID_IMAGE_RESOURCE','Prepared image resources are invalid or exceed the memory budget');}
  const warnings=Object.values(document.nodes).filter(n=>n.type==='image'&&!Object.hasOwn(images,n.props.resourceId)).map(n=>({code:'IMAGE_UNAVAILABLE',path:'nodes.'+n.id,nodeId:n.id,message:'Image unavailable; authored frame retained'}));
  let temp:string|undefined,result:Result<PdfArtifact>,stage='resource';
  try {
   temp=await mkdtemp(join(resources.tempRoot,'flowdoc-pdf-'));
   const draw=await documentFlow(document,deps.runtime,images);
   resolveLinkGeometry(document,draw);
   const fonts=await deps.subset(draw,resources,temp);
   stage='writer';const bytes=deps.write(draw,fonts,images);
   result={ok:true,value:{bytes,mediaType:'application/pdf',pageCount:draw.pages.length},warnings};
  }catch(error){
   if(error instanceof LayoutError){const source=document.sourceMap[error.nodeId];result={ok:false,issues:[{code:'LAYOUT_FAILED',path:'nodes.'+error.nodeId,nodeId:error.nodeId,message:error.message,...(source?{contentIndex:source.contentIndex,format:source.format}:{})}],warnings:[]};}
   else result=fail(stage==='writer'?'PDF_RENDER_FAILED':'RESOURCE_UNAVAILABLE',stage==='writer'?'PDF writing failed':'Text or font runtime failed');
  }finally{
   if(temp)try{await rm(temp,{recursive:true,force:true});}catch{result=fail('RESOURCE_UNAVAILABLE','Temporary output cleanup failed');}
  }
  return result!;
 }};
}
export async function createPdfEngine(resources:ExportResources):Promise<Result<PdfEngine>>{
 try {
  const snapshot=structuredClone(resources);
  const required=['font-regular','font-bold','font-italic','font-bold-italic'];
  if(snapshot.fonts.length!==4||new Set(snapshot.fonts.map(f=>f.id)).size!==4||required.some(id=>!snapshot.fonts.some(f=>f.id===id)))throw Error('Invalid font set');
  for(const font of snapshot.fonts)if(createHash('sha256').update(await readFile(font.path)).digest('hex')!==font.sha256)throw Error('Changed font');
  await access(snapshot.subsetHelperPath,constants.R_OK);await access(snapshot.tempRoot,constants.W_OK);
  const versions=await probeRuntime(snapshot);if(!versions.python.startsWith('3.11.')||versions.fontTools!=='4.58.2')throw Error('Invalid Python');
  return {ok:true,value:createEngine(snapshot,{runtime:createTextRuntime(snapshot),subset:subsetFonts,write:writePdf}),warnings:[]};
 }catch{return fail('RESOURCE_UNAVAILABLE','PDF engine resources are unavailable or incompatible');}
}
