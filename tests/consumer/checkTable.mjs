import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const unwrap=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const template=unwrap(validateTemplate(await readFile('/consumer/table-template.json','utf8')));
const engine=unwrap(await createPdfEngine(unwrap(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const pdfs=[];
for(const name of ['short','empty','long']){
 const request=JSON.parse(await readFile(`/consumer/table-${name}.json`,'utf8'));
 const document=unwrap(composeDocument(template,unwrap(prepareGeneration(template,request))));
 const original=JSON.stringify(document),pdf=unwrap(await engine.generatePdf(document));assert.equal(JSON.stringify(document),original);
 if(name==='long')assert.ok(pdf.pageCount>=3);else assert.equal(pdf.pageCount,1);
 await writeFile(`/consumer/output/table-${name}.pdf`,pdf.bytes);
 await writeFile(`/consumer/output/table-${name}.resolved.json`,JSON.stringify(document,null,2));
 const body=[];const headers=[];
 for(const id of document.rootIds){const node=document.nodes[id];if(node.type==='text-block')body.push(node.children.map(c=>c.type==='text'?c.text:'\n').join(''));else for(const [ri,rid] of node.rowIds.entries())for(const cid of document.nodes[rid].cellIds)for(const tid of document.nodes[cid].childIds)(ri<node.props.headerRowCount?headers:body).push(document.nodes[tid].children.map(c=>c.type==='text'?c.text:'\n').join(''));}
 await writeFile(`/consumer/output/table-${name}.expected.json`,JSON.stringify({body,headers},null,2));
 pdfs.push({name,pageCount:pdf.pageCount,bytes:pdf.bytes.length,sha256:createHash('sha256').update(pdf.bytes).digest('hex')});
}
const request=JSON.parse(await readFile('/consumer/table-long.json','utf8'));
const invalid=unwrap(composeDocument(template,unwrap(prepareGeneration(template,request))));
const row=Object.values(invalid.nodes).find(n=>n.type==='table-row'&&n.id.includes('item-0'));row.props.allowBreak=false;
const failure=await engine.generatePdf(invalid);assert.equal(failure.ok,false);assert.equal(failure.issues[0].code,'LAYOUT_FAILED');assert.equal(failure.issues[0].nodeId,row.id);assert.equal(failure.issues[0].contentIndex,1);
assert.deepEqual(await readdir('/consumer/temp'),[]);
await writeFile('/consumer/output/table-result.json',JSON.stringify({status:'PASS',pdfs,checks:['installed composed SRS graph','short table','empty header only','multi-page row continuation','contextual oversize row failure','immutable document','cleanup']},null,2));
