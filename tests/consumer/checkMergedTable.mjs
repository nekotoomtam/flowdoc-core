import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const t=ok(validateTemplate(await readFile('/consumer/merged-template.json','utf8')));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const results=[];
for(const [name,count] of [['short',4],['long',100]]){
 const text=Array.from({length:count},(_,i)=>`A${String(i).padStart(3,'0')} ทดสอบข้อมูล`).join('\n');
 const d=ok(composeDocument(t,ok(prepareGeneration(t,{docKey:'merged-trial',data:{text},content:[{format:'merged',data:{}}]}))));
 const pdf=ok(await engine.generatePdf(d));assert(name==='short'?pdf.pageCount===1:pdf.pageCount>=3);
 await writeFile(`/consumer/output/merged-${name}.pdf`,pdf.bytes);
 await writeFile(`/consumer/output/merged-${name}.resolved.json`,JSON.stringify(d,null,2));
 results.push({name,pageCount:pdf.pageCount,lineMarkers:count});
}
await writeFile('/consumer/output/merged-result.json',JSON.stringify({status:'PASS',results},null,2));
