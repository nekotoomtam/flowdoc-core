import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const template=JSON.parse(await readFile('/consumer/area-cover-template.json','utf8'));
const request=JSON.parse(await readFile('/consumer/area-cover-request.json','utf8'));
const resources=ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}));
const engine=ok(await createPdfEngine(resources));
const images={'22222222-2222-4222-8222-222222222222':{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])}};
const compose=t=>{const v=ok(validateTemplate(t));return ok(composeDocument(v,ok(prepareGeneration(v,request))));};
const document=compose(template),pdf=ok(await engine.generatePdf(document,images));
assert.equal(document.sections.length,1);assert.equal(pdf.pageCount,6);
await writeFile('/consumer/output/area-cover.pdf',pdf.bytes);
await writeFile('/consumer/output/area-cover-resolved.json',JSON.stringify(document,null,2));
const rejected=[];
for(const mode of ['text-overflow','body-overflow','bands-overflow']){
 const t=structuredClone(template),f=t.areaFormats['format-0'].fragment;
 if(mode==='text-overflow')f.nodes.heading.props.height.value=1;
 if(mode==='body-overflow')f.nodes.heading.props.height.value=720;
 if(mode==='bands-overflow'){t.sections[0].headerMode='all';t.sections[0].footerMode='all';f.nodes.heading.props.height.value=700;f.rootIds=['heading'];f.nodes={heading:f.nodes.heading};}
 const result=await engine.generatePdf(compose(t),images);assert.equal(result.ok,false);assert.equal(result.issues[0].code,'LAYOUT_FAILED');rejected.push({mode,issues:result.issues});
}
await writeFile('/consumer/output/area-cover-result.json',JSON.stringify({status:'PASS',pageCount:pdf.pageCount,rejected,visualAcceptance:'pending'},null,2));
