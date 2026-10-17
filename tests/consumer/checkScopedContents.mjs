import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const t=JSON.parse(await readFile('/consumer/scoped-contents-template.json','utf8'));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const results=[];
for(const name of ['short','long']){
 const r=JSON.parse(await readFile('/consumer/scoped-contents-'+name+'.json','utf8')),v=ok(validateTemplate(t)),d=ok(composeDocument(v,ok(prepareGeneration(v,r))));
 const before=JSON.stringify(d),pdf=ok(await engine.generatePdf(d));assert.equal(JSON.stringify(d),before);
 assert.equal(d.rootIds.filter(id=>d.nodes[id].type==='table-of-contents').length,3);
 assert.equal(pdf.pageCount,name==='short'?5:9);
 const links=(Buffer.from(pdf.bytes).toString('latin1').match(/\/Dest \[/g)??[]).length;assert.equal(links,(name==='short'?3:36)*8);
 for(const [ext,value] of [['pdf',pdf.bytes],['resolved.json',JSON.stringify(d,null,2)],['request.json',JSON.stringify(r,null,2)],['template.json',JSON.stringify(t,null,2)]])await writeFile(`/consumer/output/scoped-contents-${name}.${ext}`,value);
 results.push({name,pageCount:pdf.pageCount,links});
}
await writeFile('/consumer/output/scoped-contents-result.json',JSON.stringify({status:'PASS',results,visualAcceptance:'pending'},null,2));
