import {fork} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
if(process.argv[2]==='child'){
 const count=Number(process.argv[3]),enabled=process.argv[4]==='true',start=performance.now(),t=JSON.parse(await readFile('/consumer/contents-template.json','utf8'));
 const template=ok(validateTemplate(t)),content=Array.from({length:count},(_,i)=>({format:'section',data:{anchor:'h'+i,heading:`H${String(i).padStart(3,'0')} หัวข้อ / Heading`,body:'เนื้อหา / Body'}}));if(enabled)content.unshift({format:'contents',data:{}});
 const d=ok(composeDocument(template,ok(prepareGeneration(template,{docKey:t.docKey,data:{},content})))),engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'})))),pdf=ok(await engine.generatePdf(d));
 process.send({headings:count,contents:enabled,nodes:Object.keys(d.nodes).length,titleCharacters:count*'H000 หัวข้อ / Heading'.length,pages:pdf.pageCount,wallMs:Math.round(performance.now()-start),peakRssKiB:process.resourceUsage().maxRSS});
}else{
 const results=[];for(const count of [10,50,100])for(const enabled of [false,true])results.push(await new Promise((resolve,reject)=>{let result;const child=fork(new URL(import.meta.url),['child',String(count),String(enabled)],{stdio:['ignore','inherit','inherit','ipc']});child.on('message',r=>result=r);child.on('error',reject);child.on('exit',code=>code===0&&result?resolve(result):reject(Error('Resource probe failed')));}));
 await writeFile('/consumer/output/contents-resources.json',JSON.stringify({status:'PASS',runtime:'installed Linux amd64 package; fresh Node process per sample',rssScope:'KiB, Node parent peak only; native shaping/Python descendants excluded',countsEvidence:'Unit engine regression proves one full layout; code inspection: one ordered collection when contents enabled, one destination index, H fills, P footers. Timings are observations, not a capacity guarantee.',results},null,2));
}
