import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const template=ok(validateTemplate(await readFile('/consumer/cell-repeat-template.json','utf8')));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const ids=['22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const images=Object.fromEntries(ids.map((id,i)=>[id,{kind:'rgb',width:2,height:1,bytes:new Uint8Array([[20,90,160,40,150,210],[40,130,60,100,180,90],[180,80,20,210,120,30]][i])}]));
const results=[];
for(const [name,count] of [['empty',0],['one',1],['long',5]]){
 const request={docKey:'cell-repeat',data:{},content:[{format:'contents',data:{}},...['evidence','merged'].map((format,j)=>({format,data:{evidenceList:Array.from({length:count},(_,i)=>({photo:ids[i%3],caption:`BEGIN-${j}-${i}\n`+'ตรวจสอบข้อมูลภาษาไทยและภาพหลักฐานให้ตรงตามรายการที่ส่งเข้ามา\n'.repeat(name==='long'?8:1)+`END-${j}-${i}`}))}})),{format:'summary',data:{}}]};
 const original=structuredClone(request),d=ok(composeDocument(template,ok(prepareGeneration(template,request))));
 assert.deepEqual(request,original);assert.equal(Object.values(d.nodes).filter(n=>n.type==='image').length,count*2);
 for(const [id,n] of Object.entries(d.nodes))if(n.type==='image'){assert.equal(d.sourceMap[id].repeatId,'evidence-repeat');assert(Number.isInteger(d.sourceMap[id].itemIndex));}
 const pdf=ok(await engine.generatePdf(d,images)),raw=Buffer.from(pdf.bytes).toString('latin1');
 assert.equal((raw.match(/\/Subtype \/Image/g)??[]).length,Math.min(count,3));assert((raw.match(/\/Dest \[/g)??[]).length>=2);assert(raw.includes('/URI <'+Buffer.from('https://example.com/').toString('hex').toUpperCase()+'>'));if(name==='long')assert(pdf.pageCount>2);
 await writeFile(`/consumer/output/cell-repeat-${name}.pdf`,pdf.bytes);await writeFile(`/consumer/output/cell-repeat-${name}.resolved.json`,JSON.stringify(d,null,2));
 results.push({name,countPerCell:count,imageInstances:count*2,pageCount:pdf.pageCount});
}
await writeFile('/consumer/output/cell-repeat-result.json',JSON.stringify({status:'PASS',results,visualAcceptance:'pending'},null,2));
