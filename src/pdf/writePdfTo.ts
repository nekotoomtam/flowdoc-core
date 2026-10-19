import {createHash} from 'node:crypto';
import type {DrawDocument,PdfFontResource} from './drawContract.js';
import {drawIdentity,resolvePdfFonts,validatePdfDraw} from './writePdf.js';
import {buildPageContent,formatNumber,planPdfObjects} from './primitives.js';
import {snapshotImageProvider,verifiedImageStream,PDF_CHUNK_BYTES} from './streamResources.js';
import type {PdfImageProvider} from './streamResources.js';

export interface PdfStreamSink {write(chunk:Uint8Array,signal?:AbortSignal):Promise<void>}
export interface PdfStreamOptions {signal?:AbortSignal;maxBytes?:number}
export interface PdfWriteReceipt {byteLength:number;sha256:string}

// Output ownership/finalization is the caller's. A thrown write invalidates all
// partial output; never publish a receipt or reuse the partial artifact.
export async function writePdfTo(draw:DrawDocument,fonts:PdfFontResource[],input:PdfImageProvider,sink:PdfStreamSink,options:PdfStreamOptions={}):Promise<PdfWriteReceipt>{
 const provider=snapshotImageProvider(input),signal=options.signal,write=sink.write.bind(sink);
 const maxBytes=options.maxBytes??256*1048576;
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>256*1048576)throw Error('Invalid PDF output limit');
 signal?.throwIfAborted();validatePdfDraw(draw);
 if(draw.pages.length>2000||draw.pages.reduce((n,p)=>n+(p.images?.length??0),0)>10000)throw Error('PDF work limit exceeded');
 const ids=[...new Set(draw.pages.flatMap(p=>(p.images??[]).map(i=>i.resourceId)))];
 const identity=drawIdentity(draw),outputHash=createHash('sha256');
 const images=ids.map((id,index)=>{
  const image=Object.hasOwn(provider.images,id)?provider.images[id]:undefined;if(!image)throw Error('Missing image resource');
  return {id,name:`Im${index+1}`,width:image.width,height:image.height,filter:image.kind==='jpeg'?'DCTDecode':'FlateDecode',byteLength:image.content.byteLength,bytes:()=>verifiedImageStream(provider,image,false,signal),...(image.alpha?{alphaByteLength:image.alpha.byteLength,alpha:()=>verifiedImageStream(provider,image,true,signal)}:{})};
 });
 const {usages,runs}=resolvePdfFonts(draw,fonts);
 const {objects,infoId}=planPdfObjects(draw,usages,images,(index:number)=>{
  const page=draw.pages[index]!;
  const operators=(page.images??[]).map(i=>{
   if(![i.xPt,i.yPt,i.widthPt,i.heightPt].every(Number.isFinite)||i.widthPt<=0||i.heightPt<=0)throw Error('Invalid image geometry');
   return `q ${formatNumber(i.widthPt)} 0 0 ${formatNumber(i.heightPt)} ${formatNumber(i.xPt)} ${formatNumber(page.heightPt-i.yPt-i.heightPt)} cm /${images.find(r=>r.id===i.resourceId)!.name} Do Q\n`;
  }).join('');
  return Buffer.concat([buildPageContent(page,usages,runs),Buffer.from(operators,'ascii')]);
 });
 let byteLength=0;
 const emit=async(bytes:Uint8Array)=>{
  for(let at=0;at<bytes.length;at+=PDF_CHUNK_BYTES){
   signal?.throwIfAborted();const chunk=Uint8Array.from(bytes.subarray(at,at+PDF_CHUNK_BYTES));
   if(byteLength+chunk.length>maxBytes)throw Error('PDF output limit exceeded');
   outputHash.update(chunk);await write(chunk,signal);signal?.throwIfAborted();byteLength+=chunk.length;
  }
 };
 await emit(Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n','binary'));
 const offsets:number[]=[0];
 for(let id=1;id<=infoId;id++){
  offsets[id]=byteLength;await emit(Buffer.from(`${id} 0 obj\n`,'ascii'));
  const body=objects.get(id)?.();if(!body)throw Error('Missing PDF object');
  if(body instanceof Uint8Array)await emit(body);
  else {
   await emit(Buffer.from(`<< ${body.dictionary} /Length ${body.byteLength} >>\nstream\n`,'ascii'));
   for await(const chunk of body.stream()){identity.update(chunk);await emit(chunk);}
   await emit(Buffer.from('\nendstream','ascii'));
  }
  await emit(Buffer.from('\nendobj\n','ascii'));
 }
 const xrefOffset=byteLength,documentId=identity.digest('hex').slice(0,32).toUpperCase();
 await emit(Buffer.from(`xref\n0 ${infoId+1}\n0000000000 65535 f \n`,'ascii'));
 for(const offset of offsets.slice(1))await emit(Buffer.from(`${offset.toString().padStart(10,'0')} 00000 n \n`,'ascii'));
 await emit(Buffer.from(`trailer\n<< /Size ${infoId+1} /Root 1 0 R /Info ${infoId} 0 R /ID [<${documentId}> <${documentId}>] >>\nstartxref\n${xrefOffset}\n%%EOF\n`,'ascii'));
 return {byteLength,sha256:outputHash.digest('hex')};
}
