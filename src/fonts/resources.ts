import {readFile,writeFile,stat} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import {createHash} from 'node:crypto';
import type {ExportResources,FontResource} from '../runtime/exportResources.js';
import type {Result} from '../result.js';
import {FontError,type LibraryFontInput,type FontLicense} from './types.js';
import {fontUuid,fontWeight} from './validateSelection.js';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const legacy=new Set(['font-regular','font-bold','font-italic','font-bold-italic']);
export const libraryFontId=(f:LibraryFontInput)=>'library-'+f.releaseId+'-'+f.faceId+'-'+f.sha256;
async function bytes(path:string,expected:string,max:number,license=false){
 try{
  if(!isAbsolute(path)||!hash(expected))throw Error();
  if((await stat(path)).size>max)throw Error();const b=await readFile(path);
  if(b.length>max)throw Error();if(sha(b)!==expected)throw new FontError(license?'FONT_LICENSE_HASH_MISMATCH':'FONT_ASSET_HASH_MISMATCH');
  return b;
 }catch(e){if(e instanceof FontError)throw e;throw new FontError(license?'FONT_LICENSE_UNAVAILABLE':'FONT_ASSET_UNAVAILABLE');}
}
function staticTtf(b:Buffer,style?:'normal'|'italic'){
 if(b.length<12||b.readUInt32BE(0)!==0x10000)throw new FontError('INVALID_FONT_FILE');
 const tags=new Set<string>(),tables=new Map<string,{start:number;size:number}>(),count=b.readUInt16BE(4);
 if(!count||12+count*16>b.length)throw new FontError('INVALID_FONT_FILE');
 for(let i=0;i<count;i++){const offset=12+i*16,tag=b.toString('ascii',offset,offset+4),start=b.readUInt32BE(offset+8),size=b.readUInt32BE(offset+12);
  if(tags.has(tag)||start>b.length||size>b.length-start)throw new FontError('INVALID_FONT_FILE');tags.add(tag);tables.set(tag,{start,size});
 }
 if(['fvar','gvar','CFF ','CFF2'].some(t=>tags.has(t))||['head','hhea','hmtx','maxp','cmap','glyf','loca','OS/2','name'].some(t=>!tags.has(t)))throw new FontError('INVALID_FONT_FILE');
 const os=tables.get('OS/2')!,head=tables.get('head')!;
 if(os.size<64||head.size<46)throw new FontError('INVALID_FONT_FILE');
 const actual=(b.readUInt16BE(os.start+62)&1)||(b.readUInt16BE(head.start+44)&2)?'italic':'normal';
 if(style&&style!==actual)throw new FontError('FONT_FACE_UNAVAILABLE');
}
async function licenseBytes(l:FontLicense){
 if(!l||typeof l.id!=='string'||!l.id||l.id.length>200)throw new FontError('FONT_LICENSE_UNAVAILABLE');
 const b=await bytes(l.path,l.sha256,1024*1024,true);
 try{const text=new TextDecoder('utf-8',{fatal:true}).decode(b);if(!text.trim()||text.includes('\u0000'))throw Error();}catch{throw new FontError('FONT_LICENSE_UNAVAILABLE');}
 return b;
}
export function validateFontIdentities(fonts:readonly FontResource[]){
 if(!Array.isArray(fonts))throw new FontError('FONT_FACE_UNAVAILABLE');
 const ids=new Set<string>(),slots=new Set<string>();
 for(const f of fonts){
  if(!f||typeof f.id!=='string'||ids.has(f.id)||!hash(f.sha256))throw new FontError('FONT_FACE_UNAVAILABLE');ids.add(f.id);
  if(f.selection){const s=f.selection,key=s.releaseId+':'+s.weight+':'+s.style;
   if(!fontUuid(s.releaseId)||!fontUuid(s.faceId)||!fontUuid(s.assetId)||!fontWeight(s.weight)||!['normal','italic'].includes(s.style)||slots.has(key)||!Array.isArray(f.licenses)||!f.licenses.length||f.id!==libraryFontId({...s,path:f.path,sha256:f.sha256,licenses:f.licenses}))throw new FontError('FONT_FACE_UNAVAILABLE');slots.add(key);
  }else if(!legacy.has(f.id))throw new FontError('FONT_FACE_UNAVAILABLE');
 }
}
export async function loadLibraryFonts(base:ExportResources,input:readonly LibraryFontInput[]):Promise<Result<ExportResources>>{
 try{
  if(!Array.isArray(input)||input.length>256)throw new FontError('FONT_FACE_UNAVAILABLE');
  const resources=structuredClone(base);
  for(const f of input){
   const {releaseId,faceId,assetId,weight,style}=f;
   resources.fonts.push({id:libraryFontId(f),path:f.path,sha256:f.sha256,selection:{releaseId,faceId,assetId,weight,style},licenses:structuredClone(f.licenses)});
  }
  validateFontIdentities(resources.fonts);
  for(const f of resources.fonts)if(f.selection){staticTtf(await bytes(f.path,f.sha256,10*1024*1024),f.selection.style);for(const l of f.licenses!)await licenseBytes(l);}
  return {ok:true,value:resources,warnings:[]};
 }catch(e){const error=e instanceof FontError?e:new FontError('FONT_ASSET_UNAVAILABLE');return {ok:false,issues:[{code:error.code,path:error.path,message:error.message}],warnings:[]};}
}
/** Private copies bind shaping and subsetting to the same verified bytes for one generation. */
export async function snapshotFonts(resources:ExportResources,temp:string):Promise<ExportResources>{
 const result=structuredClone(resources),copies=new Map<string,string>();
 for(const [index,f] of result.fonts.entries()){
  const b=await bytes(f.path,f.sha256,10*1024*1024);if(f.selection)staticTtf(b,f.selection.style);
  let path=copies.get(f.sha256);if(!path){path=join(temp,'source-'+index+'.ttf');await writeFile(path,b,{flag:'wx',mode:0o600});copies.set(f.sha256,path);}f.path=path;
  if(f.licenses)for(const [n,l] of f.licenses.entries()){
   const data=await licenseBytes(l);let target=copies.get(l.sha256);
   if(!target){target=join(temp,'license-'+index+'-'+n+'.txt');await writeFile(target,data,{flag:'wx',mode:0o600});copies.set(l.sha256,target);}l.path=target;
  }
 }
 return result;
}
