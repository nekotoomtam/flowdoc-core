import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {loadBundledResources,createPdfEngine} from '@flowdoc/core';
const r=await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'});assert(r.ok);
const engine=await createPdfEngine(r.value);assert(engine.ok);
const d=JSON.parse(await readFile('/consumer/four-styles.resolved.json','utf8'));
d.nodeModelVersion=5;d.rootIds=['jpeg','alpha','repeat','missing'];d.nodes={};d.sourceMap={};
for(const [i,id] of d.rootIds.entries()){d.nodes[id]={id,type:'image',props:{width:{value:300,unit:'pt'},height:{value:id==='repeat'?450:150,unit:'pt'},resourceId:id==='repeat'?'jpeg':id}};d.sourceMap[id]={contentIndex:i,format:'image',sourceId:id};}
const map={jpeg:{kind:'jpeg',width:32,height:16,bytes:await readFile('/consumer/red.jpg')},alpha:{kind:'rgb',width:2,height:2,bytes:new Uint8Array([255,0,0,0,255,0,0,0,255,0,0,0]),alpha:new Uint8Array([255,128,0,255])}};
const result=await engine.value.generatePdf(d,map);assert(result.ok,JSON.stringify(result));assert.equal(result.value.pageCount,2);assert.equal(result.warnings.length,1);assert.equal(result.warnings[0].nodeId,'missing');
const text=Buffer.from(result.value.bytes).toString('latin1');assert.equal((text.match(/\/Subtype \/Image/g)||[]).length,3);assert(text.includes('/SMask'));assert(text.includes('/DCTDecode'));
await writeFile('/consumer/output/images.pdf',result.value.bytes);
await writeFile('/consumer/output/image-result.json',JSON.stringify({status:'PASS',pageCount:2,checks:['public prepared resource map','JPEG once across pages','RGB alpha soft mask','whole frame page break','missing-image warning and reserved space']}));
const {validateTemplate,prepareGeneration,composeDocument}=await import('@flowdoc/core');
const ref='01a11aa0-c9e6-780a-ae76-834fad559f4d';
const t={schemaVersion:1,nodeModelVersion:5,templateId:'image-binding',docKey:'image-binding',version:1,name:'Image binding',book:d.book,styles:d.styles,globalSchema:{type:'object',fields:{photo:{type:'image',required:true}}},formats:{photo:{inputSchema:{type:'object',fields:{}},fragment:{rootIds:['p'],nodes:{p:{id:'p',type:'image',props:{width:{value:100,unit:'pt'},height:{value:100,unit:'pt'},source:{scope:'global',key:'photo'}}}}},repeats:[]}},examples:[]};
const valid=validateTemplate(t);assert(valid.ok,JSON.stringify(valid));const prepared=prepareGeneration(valid.value,{docKey:t.docKey,data:{photo:ref},content:[{format:'photo',data:{}}]});assert(prepared.ok,JSON.stringify(prepared));const composed=composeDocument(valid.value,prepared.value);assert(composed.ok,JSON.stringify(composed));const bound=await engine.value.generatePdf(composed.value,{[ref]:map.jpeg});assert(bound.ok,JSON.stringify(bound));assert.equal(bound.warnings.length,0);await writeFile('/consumer/output/bound-image.pdf',bound.value.bytes);
