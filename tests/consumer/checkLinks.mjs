import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const t=ok(validateTemplate(await readFile('/consumer/links-template.json','utf8')));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const results=[];
for(const [name,count] of [['short',3],['reflow',60]]){
 const request={docKey:'links-trial',data:{},content:[{format:'section',data:{anchor:'start',target:'end',heading:'หัวข้อแรก / First section',body:Array.from({length:count},(_,i)=>`บรรทัดที่ ${i+1} ทดสอบตำแหน่งปลายทางและลิงก์`).join('\n')}},{format:'section',data:{anchor:'end',target:'start',heading:'หัวข้อสุดท้าย / Last section',body:'จบเอกสาร'}}]};
 const d=ok(composeDocument(t,ok(prepareGeneration(t,request)))),pdf=ok(await engine.generatePdf(d));
 const text=Buffer.from(pdf.bytes).toString('latin1');assert((text.match(/\/Subtype \/Link/g)??[]).length>=6);assert((text.match(/\/S \/URI/g)??[]).length>=4);assert((text.match(/\/Dest \[/g)??[]).length>=2);assert(name==='short'?pdf.pageCount===1:pdf.pageCount>=2);
 await writeFile(`/consumer/output/links-${name}.pdf`,pdf.bytes);await writeFile(`/consumer/output/links-${name}.request.json`,JSON.stringify(request,null,2));await writeFile(`/consumer/output/links-${name}.resolved.json`,JSON.stringify(d,null,2));results.push({name,pageCount:pdf.pageCount,annotations:(text.match(/\/Subtype \/Link/g)??[]).length});
}
await writeFile('/consumer/output/links-result.json',JSON.stringify({status:'PASS',interactiveActivation:'pending',results},null,2));
