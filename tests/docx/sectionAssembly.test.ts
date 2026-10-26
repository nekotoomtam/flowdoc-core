import {it,expect} from 'vitest';
import JSZip from 'jszip';
import {validateTemplate,prepareGeneration,composeDocument,createDocxEngine} from '../../src/index.js';
import {assemblyTemplate,assemblyRequest} from '../helpers/assembly.js';
import {fonts,noImages,staged} from './helpers.js';
const take=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
it('exports repeated definitions as distinct editable native Word Sections with separate headers',async()=>{
 const t=assemblyTemplate();for(const s of t.sections)s.header={baseTextStyleId:'body',inputSchema:{type:'object',fields:{port:{type:'string',required:true}}},fragment:{rootIds:['head'],nodes:{head:{id:'head',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'port',type:'field-ref',scope:'header',key:'port'}]}}}};
 const q:any=assemblyRequest(t);q.sections.forEach((s:any)=>s.header={port:s.instanceKey});
 const v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,q)))),e=take(await createDocxEngine(fonts())),sink=staged();
 take(await e.generateDocxTo(d,noImages,sink.output,{textLayout:'native'}));const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await z.file('word/document.xml')!.async('string');
 expect(xml.match(/<w:sectPr>/g)).toHaveLength(3);expect(xml.indexOf('Alpha')).toBeLessThan(xml.indexOf('Beta'));expect(xml.indexOf('Beta')).toBeLessThan(xml.indexOf('Gamma'));
 const headers=await Promise.all(Object.keys(z.files).filter(p=>/^word\/header\d+\.xml$/.test(p)).map(p=>z.file(p)!.async('string')));
 for(const key of ['first','middle','last'])expect(headers.some(h=>h.includes('>'+key+'<'))).toBe(true);
 expect(xml).not.toContain('<w:txbxContent>');expect(xml).not.toContain('linkToPrevious');
});
