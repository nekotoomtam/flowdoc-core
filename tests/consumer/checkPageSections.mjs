import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const t=ok(validateTemplate(await readFile('/consumer/page-sections-template.json','utf8')));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const images={'22222222-2222-4222-8222-222222222222':{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])}};
const results=[];
for(const name of ['long','static']){
 const request=JSON.parse(await readFile('/consumer/page-sections-request.json','utf8'));if(name==='static')request.content=[];
 const d=ok(composeDocument(t,ok(prepareGeneration(t,request)))),pdf=ok(await engine.generatePdf(d,images));
 const raw=Buffer.from(pdf.bytes).toString('latin1');assert(raw.includes('/Subtype /Image'));assert((raw.match(/\/Dest \[/g)??[]).length>=2);
 if(name==='long')assert(pdf.pageCount>=4);else assert.equal(pdf.pageCount,2);
 await writeFile(`/consumer/output/page-sections-${name}.pdf`,pdf.bytes);
 await writeFile(`/consumer/output/page-sections-${name}.resolved.json`,JSON.stringify(d,null,2));
 results.push({name,pageCount:pdf.pageCount});
}
await writeFile('/consumer/output/page-sections-result.json',JSON.stringify({status:'PASS',results,visualAcceptance:'pending'},null,2));
