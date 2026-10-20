import {createHash} from 'node:crypto';
import {createInflate} from 'node:zlib';
import {finished} from 'node:stream/promises';

export const PDF_STREAM_CONTRACT='flowdoc-pdf-stream/1' as const;
export const PDF_CHUNK_BYTES=64*1024;
export interface PdfStreamRef {key:string;byteLength:number;sha256:string}
export interface StreamPdfImage {kind:'jpeg'|'rgb-deflate';width:number;height:number;content:PdfStreamRef;alpha?:PdfStreamRef}
export type PdfImageMetadata=Record<string,{width:number;height:number}>;
export interface PdfImageProvider {
 contract:typeof PDF_STREAM_CONTRACT;
 images:Record<string,StreamPdfImage>;
 // Adapter owns handles. It must stop/close on return, error and AbortSignal.
 open(ref:Readonly<PdfStreamRef>,signal?:AbortSignal):AsyncIterable<Uint8Array>;
}
export function snapshotImageProvider(provider:PdfImageProvider):PdfImageProvider{
 if(!provider||provider.contract!==PDF_STREAM_CONTRACT||typeof provider.open!=='function'||!provider.images||typeof provider.images!=='object'||Array.isArray(provider.images))throw Error('Invalid image provider');
 const images:Record<string,StreamPdfImage>=Object.create(null),entries=Object.entries(provider.images);
 if(entries.length>2000)throw Error('Prepared image count exceeded');
 const ref=(r:PdfStreamRef)=>{if(!r||typeof r.key!=='string'||!r.key.length||Buffer.byteLength(r.key)>2048||!Number.isSafeInteger(r.byteLength)||r.byteLength<1||r.byteLength>50*1048576||typeof r.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(r.sha256)||Object.keys(r).some(k=>!['key','byteLength','sha256'].includes(k)))throw Error('Invalid image stream reference');return Object.freeze({key:r.key,byteLength:r.byteLength,sha256:r.sha256});};
 let metadataBytes=0;
 for(const [id,image] of entries){
  if(!id.length||id.length>128||!image||!['jpeg','rgb-deflate'].includes(image.kind)||!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1||image.width*image.height>8_000_000||Object.keys(image).some(k=>!['kind','width','height','content','alpha'].includes(k)))throw Error('Invalid image metadata');
  const content=ref(image.content);let alpha:PdfStreamRef|undefined;
  if(image.alpha!==undefined){if(image.kind!=='rgb-deflate'||image.alpha.key===image.content.key)throw Error('Invalid alpha stream');alpha=ref(image.alpha);}
  const copy={kind:image.kind,width:image.width,height:image.height,content,...(alpha?{alpha}:{})};
  metadataBytes+=Buffer.byteLength(id)+Buffer.byteLength(JSON.stringify(copy));if(metadataBytes>8*1048576)throw Error('Image metadata budget exceeded');images[id]=Object.freeze(copy);
 }
 Object.freeze(images);return Object.freeze({contract:PDF_STREAM_CONTRACT,images,open:provider.open.bind(provider)});
}

// Parse only JPEG framing/SOF/SOS, never retain the image or decompress pixels.
// Raster decoding/orientation/colour normalization belong to the preparer.
class JpegCheck {
 private phase='soi0';private marker=0;private length=0;private remaining=0;private segment:number[]=[];private found=false;private scan=false;private last=-1;private beforeLast=-1;
 constructor(private width:number,private height:number){}
 push(chunk:Uint8Array){
  for(const b of chunk){
   this.beforeLast=this.last;this.last=b;
   if(this.scan)continue;
   if(this.phase==='soi0'){if(b!==255)throw Error('Invalid JPEG');this.phase='soi1';}
   else if(this.phase==='soi1'){if(b!==216)throw Error('Invalid JPEG');this.phase='marker0';}
   else if(this.phase==='marker0'){if(b!==255)throw Error('Invalid JPEG marker');this.phase='marker1';}
   else if(this.phase==='marker1'){if(b===255)continue;if(b===0||b===216||b===217||b===1||(b>=208&&b<=215))throw Error('Unsupported JPEG marker');this.marker=b;this.phase='len0';}
   else if(this.phase==='len0'){this.length=b*256;this.phase='len1';}
   else if(this.phase==='len1'){this.length+=b;if(this.length<2)throw Error('Invalid JPEG segment');this.remaining=this.length-2;this.segment=[];this.phase='segment';if(!this.remaining)this.endSegment();}
   else {if([192,194,218].includes(this.marker))this.segment.push(b);if(--this.remaining===0)this.endSegment();}
  }
 }
 private endSegment(){const s=this.segment;
  if((this.marker>=192&&this.marker<=207)&&![192,194,196,200,204].includes(this.marker))throw Error('Unsupported JPEG frame');
  if(this.marker===192||this.marker===194){if(this.found||this.length!==17||s[0]!==8||s[1]!*256+s[2]!!==this.height||s[3]!*256+s[4]!!==this.width||s[5]!==3)throw Error('JPEG dimensions or colour mismatch');this.found=true;}
  if(this.marker===218){const count=s[0]!;if(!this.found||count<1||count>3||this.length!==6+2*count)throw Error('Invalid JPEG scan');this.scan=true;}
  this.phase='marker0';this.segment=[];
 }
 finish(){if(!this.found||!this.scan||this.beforeLast!==255||this.last!==217)throw Error('Truncated JPEG');}
}

export async function* verifiedImageStream(provider:PdfImageProvider,image:StreamPdfImage,alpha:boolean,signal?:AbortSignal):AsyncGenerator<Uint8Array>{
 signal?.throwIfAborted();const reference=alpha?image.alpha!:image.content;
 const hash=createHash('sha256');let bytes=0,decoded=0,decodeError:Error|undefined;
 const jpeg=!alpha&&image.kind==='jpeg'?new JpegCheck(image.width,image.height):undefined;
 const inflate=jpeg?undefined:createInflate({chunkSize:PDF_CHUNK_BYTES});
 const expected=image.width*image.height*(alpha?1:3);
 inflate?.on('data',(chunk:Buffer)=>{decoded+=chunk.length;if(decoded>expected)inflate.destroy(Error('Inflated image length exceeded'));});
 const complete=inflate?finished(inflate).catch((e:Error)=>{decodeError=e;}):undefined;
 const abort=()=>inflate?.destroy(Error('Image read aborted'));signal?.addEventListener('abort',abort,{once:true});
 try{
  for await(const incoming of provider.open(reference,signal)){
   signal?.throwIfAborted();if(!(incoming instanceof Uint8Array)||!incoming.length||incoming.length>PDF_CHUNK_BYTES)throw Error('Invalid image stream chunk');
   // Provider storage can be reused/mutated while zlib or output is awaiting.
   // Hash, validation and emission must consume the same bounded owned bytes.
   const chunk=Uint8Array.from(incoming);
   bytes+=chunk.length;if(bytes>reference.byteLength)throw Error('Image stream length exceeded');
   hash.update(chunk);if(jpeg)jpeg.push(chunk);
   if(inflate)await new Promise<void>((resolve,reject)=>{
    // zlib can emit error without invoking this write's callback.
    const failed=(e:Error)=>{inflate.off('error',failed);reject(e);};inflate.once('error',failed);
    inflate.write(chunk,e=>{inflate.off('error',failed);e?reject(e):resolve();});
   });
   if(decodeError)throw decodeError;
   yield chunk;
  }
  if(inflate){inflate.end();await complete;if(decodeError)throw decodeError;if(decoded!==expected||inflate.bytesWritten!==bytes)throw Error('Invalid compressed image length');}
  jpeg?.finish();signal?.throwIfAborted();
  if(bytes!==reference.byteLength||hash.digest('hex')!==reference.sha256)throw Error('Image identity changed');
 }finally{signal?.removeEventListener('abort',abort);inflate?.destroy();await complete;}
}
