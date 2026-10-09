export type PreparedPdfImage={kind:'jpeg';width:number;height:number;bytes:Uint8Array}|{kind:'rgb';width:number;height:number;bytes:Uint8Array;alpha?:Uint8Array};
export type PdfImageResources=Record<string,PreparedPdfImage>;
export function validateImageResources(resources:PdfImageResources):void{
 if(!resources||typeof resources!=='object'||Array.isArray(resources))throw Error('Invalid image map');
 const entries=Object.entries(resources);if(entries.length>20)throw Error('Too many images');let total=0;
 for(const [key,r] of entries){
  if(!key.length||key.length>128||!r||!['rgb','jpeg'].includes(r.kind)||!Number.isSafeInteger(r.width)||!Number.isSafeInteger(r.height)||r.width<1||r.height<1||r.width*r.height>8_000_000||!(r.bytes instanceof Uint8Array))throw Error('Invalid image');
  total+=r.bytes.byteLength;
  if(r.kind==='rgb'){
   if(r.bytes.byteLength!==r.width*r.height*3)throw Error('Invalid RGB length');
   if(r.alpha!==undefined){if(!(r.alpha instanceof Uint8Array)||r.alpha.byteLength!==r.width*r.height)throw Error('Invalid alpha length');total+=r.alpha.byteLength;}
  }else validateJpeg(r);
  if(total>64*1048576)throw Error('Image memory budget exceeded');
 }
}
function validateJpeg(r:PreparedPdfImage){
 const b=r.bytes;if(b.length<4||b[0]!==255||b[1]!==216||b[b.length-2]!==255||b[b.length-1]!==217)throw Error('Invalid JPEG');
 let offset=2,found=false,scan=false;
 while(offset+3<b.length){
  if(b[offset++]!==255)throw Error('Invalid JPEG marker');while(b[offset]===255)offset++;
  const marker=b[offset++];
  const length=b[offset]!*256+b[offset+1]!;if(length<2||offset+length>b.length)throw Error('Invalid JPEG segment');
  if(marker===192||marker===194){if(found||length!==17||b[offset+2]!==8||b[offset+3]!*256+b[offset+4]!!==r.height||b[offset+5]!*256+b[offset+6]!!==r.width||b[offset+7]!==3)throw Error('JPEG dimensions or colour mismatch');found=true;}
  if(marker===218){const count=b[offset+2]!;if(!found||count<1||count>3||length!==6+2*count||offset+length>=b.length-2)throw Error('Invalid JPEG scan');scan=true;break;}
  offset+=length;
 }
 if(!found||!scan)throw Error('Unsupported JPEG');
}

export function snapshotImageResources(resources:PdfImageResources):PdfImageResources{
 return Object.fromEntries(Object.entries(resources).map(([id,r])=>[id,{kind:r.kind,width:r.width,height:r.height,bytes:Uint8Array.from(r.bytes),...(r.kind==='rgb'&&r.alpha?{alpha:Uint8Array.from(r.alpha)}:{})}])) as PdfImageResources;
}
