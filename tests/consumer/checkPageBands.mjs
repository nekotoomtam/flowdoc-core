import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const template=JSON.parse(await readFile('/consumer/page-bands-template.json','utf8'));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const images={'22222222-2222-4222-8222-222222222222':{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])}};
const results=[];
for(const name of ['short','long','overflow','empty']){
 const t=structuredClone(template),r=JSON.parse(await readFile('/consumer/page-bands-request.json','utf8'));
 if(name==='long')r.header.projectName='รายงานผลการทดสอบระบบสารสนเทศเพื่อสนับสนุนการปฏิบัติงานและติดตามผลการดำเนินงานของหน่วยงาน '.repeat(3);
 if(name==='overflow')r.header.projectName='ชื่อโครงการที่ยาวเกินพื้นที่ปก\n'.repeat(100);
 r.header.logo='22222222-2222-4222-8222-222222222222';
 if(name==='empty'){t.sections=[{id:'cover',role:'cover',source:{kind:'authored',repeats:[],fragment:{rootIds:[],nodes:{}}}},{id:'blank',source:{kind:'blank'}}];t.formats={};t.areaFormats={};r.content=[];}
 const d=ok(composeDocument(ok(validateTemplate(t)),ok(prepareGeneration(ok(validateTemplate(t)),r))));
 const result=await engine.generatePdf(d,images);
 if(name==='overflow'){assert.equal(result.ok,false);assert.equal(result.issues[0].code,'LAYOUT_FAILED');assert(result.issues[0].path.startsWith('header'));results.push({name,status:'rejected',issues:result.issues});continue;}
 const pdf=ok(result);assert(name==='empty'?pdf.pageCount===2:pdf.pageCount>=6);
 await writeFile(`/consumer/output/page-bands-${name}.pdf`,pdf.bytes);results.push({name,pageCount:pdf.pageCount});
}
await writeFile('/consumer/output/page-bands-result.json',JSON.stringify({status:'PASS',results,visualAcceptance:'pending'},null,2));
