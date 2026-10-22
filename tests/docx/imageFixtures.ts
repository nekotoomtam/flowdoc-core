import {readFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import * as api from '../../src/index.js';
import {sectionTemplate} from '../helpers/sections.js';
export const imageId='01a11aa0-c9e6-780a-ae76-834fad559f4d';
export const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export function imageDocument(band=false){
 const t=sectionTemplate();t.sections=[t.sections[0]];t.examples=[];t.areaFormats={};
 t.globalSchema.fields.photo={type:'image',required:true};
 const graph={rootIds:['picture'],nodes:{picture:{id:'picture',type:'image',props:{width:{unit:'pt',value:100},height:{unit:'pt',value:60},source:{scope:'global',key:'photo'}}}}};
 if(band)t.sections[0].header={fragment:graph,baseTextStyleId:'body',inputSchema:{type:'object',fields:{}}};
 else t.sections[0].source={kind:'authored',repeats:[],fragment:graph};
 const v=api.validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));
 const p=api.prepareGeneration(v.value,{docKey:t.docKey,data:{projectName:'Small image',photo:imageId},sections:{}});if(!p.ok)throw Error(JSON.stringify(p));
 const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
export function imageProvider(kind:'jpeg'|'rgb-deflate'='jpeg',alpha=false){
 const rgb=Buffer.from([255,0,0,0,255,0]),mask=Buffer.from([255,64]);
 const content=kind==='jpeg'?readFileSync('fixtures/images/red.jpg'):deflateSync(rgb),opacity=deflateSync(mask);
 const ref=(bytes:Buffer,key:string)=>({key,byteLength:bytes.length,sha256:sha(bytes)});
 const image:api.StreamPdfImage={kind,width:kind==='jpeg'?32:2,height:kind==='jpeg'?16:1,content:ref(content,'colour'),...(alpha?{alpha:ref(opacity,'alpha')}:{})};
 const opened:string[]=[],closed:string[]=[];
 const provider:api.PdfImageProvider={contract:api.PDF_STREAM_CONTRACT,images:{[imageId]:image},async *open(r){opened.push(r.key);try{const bytes=r.key==='alpha'?opacity:content;for(let at=0;at<bytes.length;at+=7)yield bytes.subarray(at,at+7);}finally{closed.push(r.key);}}};
 return {provider,image,content,rgb,mask,opened,closed};
}
