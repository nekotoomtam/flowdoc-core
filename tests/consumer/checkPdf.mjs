import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadBundledResources,createPdfEngine} from '@flowdoc/core';
const resources=await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'});
assert.equal(resources.ok,true,JSON.stringify(resources));
const initialized=await createPdfEngine(resources.value);assert.equal(initialized.ok,true,JSON.stringify(initialized));
const results=[];
for(const name of ['four-styles','overflow']){
 const document=JSON.parse(await readFile(`/consumer/${name}.resolved.json`,'utf8'));
 const original=JSON.stringify(document),result=await initialized.value.generatePdf(document);
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(JSON.stringify(document),original);
 const {bytes,pageCount,mediaType}=result.value;assert.equal(mediaType,'application/pdf');
 if(name==='four-styles')assert.equal(pageCount,1);else assert.equal(pageCount,2);
 await writeFile(`/consumer/output/${name}.pdf`,bytes);
 const expected=document.rootIds.map(id=>document.nodes[id].children.map(c=>c.type==='text'?c.text:'\n').join('')).join('\n');
 await writeFile(`/consumer/output/${name}.expected.txt`,expected);
 results.push({name,pageCount,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const document=JSON.parse(await readFile('/consumer/four-styles.resolved.json','utf8'));
const invalid=structuredClone(document);invalid.nodes[invalid.rootIds[0]].type='table';
const rejected=await initialized.value.generatePdf(invalid);assert.equal(rejected.ok,false);assert.equal(rejected.issues[0].code,'LAYOUT_FAILED');assert.equal('value' in rejected,false);
const concurrent=await Promise.all([initialized.value.generatePdf(document),initialized.value.generatePdf(document)]);assert.ok(concurrent.every(r=>r.ok));
const shaper=resources.value.shaperPath;await rename(shaper,shaper+'.held');
try{
 assert.equal((await createPdfEngine(resources.value)).ok,false);
 const failed=await initialized.value.generatePdf(document);assert.equal(failed.ok,false);assert.equal(failed.issues[0].code,'RESOURCE_UNAVAILABLE');assert.equal('value' in failed,false);
}finally{await rename(shaper+'.held',shaper);}
assert.deepEqual(await readdir('/consumer/temp'),[]);
const result={status:'PASS',pdfs:results,checks:['public PDF engine','four styles','two-page flow','unsupported table rejected','concurrent generation','missing resource','cleanup','immutable input']};
await writeFile('/consumer/output/pdf-result.json',JSON.stringify(result,null,2)+'\n');
