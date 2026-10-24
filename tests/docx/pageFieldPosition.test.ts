import {it,expect} from 'vitest';
import {Document,Packer,Paragraph} from 'docx';
import JSZip from 'jszip';
import {pageField} from '../../src/docx/fields.js';
it.each([['current',0],['total',0],['total',2]]as const)('positions native %s fields with %s excluded pages without changing instructions',async(field,leadingExcluded)=>{
 const run=pageField(field,{size:24},{anchors:new Map(),sectionName:'test',leadingExcluded,hideNumbers:false,inBand:true},1);
 const zip=await JSZip.loadAsync(await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[run]})]}]}))),xml=await zip.file('word/document.xml')!.async('string');
 const native=[...xml.matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)].filter(m=>m[0].includes('w:instrText'));expect(native.length).toBeGreaterThan(0);for(const part of native)expect(part[0],xml).toContain('<w:position w:val="0.5pt"/>');expect(xml).toContain(field==='current'?'PAGE':'NUMPAGES');if(leadingExcluded)expect(xml).toContain(' - 2 ');
});
