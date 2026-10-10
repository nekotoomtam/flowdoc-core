import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const t=JSON.parse(await readFile('/consumer/page-numbering-template.json','utf8')),r=JSON.parse(await readFile('/consumer/page-numbering-request.json','utf8'));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const images={'22222222-2222-4222-8222-222222222222':{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])}},results=[];
for(const name of ['long','no-contents','no-fields','repeated']){
 const template=structuredClone(t);
 if(name==='no-contents'){const s=template.sections.find(s=>s.key==='contents');s.source.fragment={rootIds:[],nodes:{}};}
 if(name==='no-fields')for(const s of template.sections)for(const k of ['header','footer'])if(s[k])for(const n of Object.values(s[k].fragment.nodes))if(n.children)n.children=n.children.filter(c=>c.type!=='system-page-field');
 if(name==='repeated')template.sections.find(s=>s.key==='closing').numbering.startAt=104;
 const v=ok(validateTemplate(template)),p=ok(prepareGeneration(v,r)),d=ok(composeDocument(v,p)),pdf=ok(await engine.generatePdf(d,images));
 assert(pdf.pageCount>=6);await writeFile('/consumer/output/page-numbering-'+name+'.pdf',pdf.bytes);results.push({name,pageCount:pdf.pageCount,fingerprint:v.fingerprint});
}
const excluded=structuredClone(t),last=excluded.sections.find(s=>s.key==='closing');last.numbering={mode:'exclude'};for(const n of Object.values(last.footer.fragment.nodes))if(n.children)n.children=n.children.filter(c=>c.type!=='system-page-field'||c.field!=='current');const v=ok(validateTemplate(excluded));const failed=await engine.generatePdf(ok(composeDocument(v,ok(prepareGeneration(v,r)))),images);assert.equal(failed.ok,false);assert.match(JSON.stringify(failed),/no counted/);
await writeFile('/consumer/output/page-numbering-result.json',JSON.stringify({status:'PASS',results,visualAcceptance:'pending'},null,2));
