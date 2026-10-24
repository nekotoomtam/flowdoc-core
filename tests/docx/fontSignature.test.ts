import {it,expect}from'vitest';
import {readFileSync}from'node:fs';
import{Document,Packer,Paragraph}from'docx';
import JSZip from'jszip';
import{fontSignature,correctFontSignatures}from'../../src/docx/font-signature.js';
const bytes=()=>readFileSync('assets/fonts/Sarabun-Regular.ttf');
function os2(b:Buffer){for(let i=0;i<b.readUInt16BE(4);i++){const at=12+i*16;if(b.toString('ascii',at,at+4)==='OS/2')return at;}throw Error('Fixture missing OS/2');}
it('does not invent codepage coverage for a version0 font',()=>{const b=bytes(),at=os2(b),start=b.readUInt32BE(at+8);b.writeUInt16BE(0,start);b.writeUInt32BE(78,at+12);expect(fontSignature(b)).toMatchObject({csb0:'00000000',csb1:'00000000',usb0:'21000007'});});
it('rejects a truncated OS/2 directory extent',()=>{const b=bytes(),at=os2(b);b.writeUInt32BE(b.length,at+8);expect(()=>fontSignature(b)).toThrow();});
it('matches actual serializer escaping and retains unrelated table bytes',async()=>{
 const name=`Example & Family's "Thai"`,data=bytes(),z=await JSZip.loadAsync(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('test')]}],fonts:[{name,data}]}))),xml=await z.file('word/fontTable.xml')!.async('string'),next=correctFontSignatures(xml,[{name,data}]);
 expect(next).toContain('w:csb0="20010193"');expect(next.replace(/<w:sig\b[^>]*\/>/,'SIGNATURE')).toBe(xml.replace(/<w:sig\b[^>]*\/>/,'SIGNATURE'));
});
