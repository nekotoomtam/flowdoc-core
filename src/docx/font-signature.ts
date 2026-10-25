import {fail} from './types.js';

/** A family's font-table entry describes its primary regular face. Never use
 * the serializer's fixed Latin signature for an arbitrary embedded font. */
export function fontSignature(bytes:Uint8Array):Record<string,string>{
 const b=Buffer.from(bytes),bad=():never=>fail('DOCX_RESOURCE_INVALID','fonts.signature','Invalid OS/2 font signature');
 if(b.length<12||b.readUInt32BE(0)!==0x10000)bad();
 const count=b.readUInt16BE(4);if(12+count*16>b.length)bad();
 let start=-1,length=0;
 for(let i=0;i<count;i++){const at=12+i*16;if(b.toString('ascii',at,at+4)==='OS/2'){start=b.readUInt32BE(at+8);length=b.readUInt32BE(at+12);break;}}
 if(start<12+count*16||length<64||start>b.length-length)bad();
 const value=(offset:number)=>b.readUInt32BE(start+offset).toString(16).toUpperCase().padStart(8,'0');
 const result:Record<string,string>={};for(let i=0;i<4;i++)result['usb'+i]=value(42+4*i);
 const hasCodePages=b.readUInt16BE(start)>=1&&length>=86;
 for(let i=0;i<2;i++)result['csb'+i]=hasCodePages?value(78+4*i):'00000000';
 return result;
}
const escaped=(v:string)=>v.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
export function correctFontSignatures(xml:string,fonts:readonly {name:string;data:Uint8Array}[]):string{
 const signatures=new Map(fonts.map(f=>[escaped(f.name),fontSignature(f.data)])),seen=new Set<string>();
 const result=xml.replace(/<w:font\b([^>]*)>([\s\S]*?)<\/w:font>/g,(whole,attrs:string,body:string)=>{
  const name=/\bw:name="([^"]*)"/.exec(attrs)?.[1];if(!name||!signatures.has(name))return whole;
  if(seen.has(name))fail('DOCX_SERIALIZATION_FAILED','word/fontTable.xml','Duplicate embedded font entry');seen.add(name);
  const tags=body.match(/<w:sig\b[^>]*\/>/g);if(tags?.length!==1)fail('DOCX_SERIALIZATION_FAILED','word/fontTable.xml','Missing or ambiguous embedded font signature');
  const signature='<w:sig '+Object.entries(signatures.get(name)!).map(([k,v])=>`w:${k}="${v}"`).join(' ')+'/>';
  return `<w:font${attrs}>${body.replace(tags[0]!,signature)}</w:font>`;
 });
 if(seen.size!==signatures.size)fail('DOCX_SERIALIZATION_FAILED','word/fontTable.xml','Embedded font entry missing');
 return result;
}
