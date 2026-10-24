import {fail} from './types.js';

/** Owned TrueType metrics, without a family, phrase or size calibration. */
export class SourceFontMetrics {
 private readonly bytes:Buffer;
 private readonly tables=new Map<string,{offset:number;length:number}>();
 readonly units:number;
 readonly winAscent:number;
 readonly winDescent:number;
 private readonly glyphCount:number;
 private readonly horizontalCount:number;
 private readonly longLoca:boolean;
 constructor(bytes:Uint8Array){
  this.bytes=Buffer.from(bytes);const b=this.bytes;
  this.range(0,12);const count=b.readUInt16BE(4);this.range(12,count*16);
  for(let i=0;i<count;i++){const p=12+i*16,offset=b.readUInt32BE(p+8),length=b.readUInt32BE(p+12);this.range(offset,length);this.tables.set(b.toString('ascii',p,p+4),{offset,length});}
  const head=this.table('head',54),os=this.table('OS/2',78),maxp=this.table('maxp',6),hhea=this.table('hhea',36);
  this.units=b.readUInt16BE(head+18);this.winAscent=b.readUInt16BE(os+74);this.winDescent=b.readUInt16BE(os+76);
  this.glyphCount=b.readUInt16BE(maxp+4);this.horizontalCount=b.readUInt16BE(hhea+34);
  const format=b.readInt16BE(head+50);this.longLoca=format===1;
  if(!this.units||!this.glyphCount||!this.horizontalCount||this.horizontalCount>this.glyphCount||![0,1].includes(format))this.invalid();
  this.table('hmtx',this.horizontalCount*4);this.table('loca',(this.glyphCount+1)*(this.longLoca?4:2));this.table('glyf',0);
 }
 private invalid():never{return fail('DOCX_CAPABILITY_UNSUPPORTED','resources.fonts','Source word layout requires bounded TrueType metrics');}
 private range(offset:number,length:number){if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>this.bytes.length)this.invalid();}
 private table(name:string,length:number){const t=this.tables.get(name);if(!t||t.length<length)this.invalid();return t.offset;}
 private glyph(id:number){if(!Number.isInteger(id)||id<0||id>=this.glyphCount)this.invalid();}
 advance(id:number,size:number){this.glyph(id);return this.bytes.readUInt16BE(this.table('hmtx',0)+Math.min(id,this.horizontalCount-1)*4)/this.units*size;}
 ink(id:number){
  this.glyph(id);const b=this.bytes,loca=this.table('loca',0),glyf=this.tables.get('glyf')!;
  const at=(n:number)=>this.longLoca?b.readUInt32BE(loca+n*4):b.readUInt16BE(loca+n*2)*2;
  const start=at(id),end=at(id+1);if(end<start||end>glyf.length)this.invalid();
  if(start===end)return undefined;if(end-start<10)this.invalid();const p=glyf.offset+start;
  if(b.readInt16BE(p)===0)return undefined;
  return {left:b.readInt16BE(p+2),bottom:b.readInt16BE(p+4),right:b.readInt16BE(p+6),top:b.readInt16BE(p+8)};
 }
}
