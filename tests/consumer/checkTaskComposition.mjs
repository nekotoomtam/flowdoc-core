import assert from 'node:assert/strict';
import {readFile,writeFile,open,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {normalizeTaskInput,composeTaskDocument,validateTemplate,prepareGeneration,composeDocument,createPdfEngine,loadBundledResources,PDF_STREAM_CONTRACT} from '@flowdoc/core';
const value=v=>({async byteLength(){return Buffer.byteLength(JSON.stringify(v));},async kind(){return Array.isArray(v)?'array':v!==null&&typeof v==='object'?'object':'scalar';},async scalar(){assert(!v||typeof v!=='object','No full container read');return v;},async *properties(){for(const[k,x]of Object.entries(v))yield[k,value(x)];},async *elements(){for(const x of v)yield value(x);}});
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const resources=ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'})),engine=ok(await createPdfEngine(resources)),results=[];
for(const prefix of ['row-groups','area-cover','srs']){
 const template=JSON.parse(await readFile(prefix+'-template.json','utf8')),q=JSON.parse(await readFile(prefix+'-request.json','utf8')),v=ok(validateTemplate(template));const {docKey,version,...input}=q;let normalized='';
 const markers=new Map();ok(await normalizeTaskInput(v,value(input),{write:async s=>{normalized+=s;},images:{collect:async(x,c)=>{const raw=x&&await x.kind()==='scalar'?await x.scalar():undefined;markers.set(c.pointer,raw?{kind:'task-image',version:1,availability:'available',assetId:raw}:{kind:'task-image',version:1,availability:'unavailable',reason:'IMAGE_SOURCE_MISSING',findingId:'30000000-0000-4000-8000-000000000001'});},seal:async()=>{},resolve:async c=>markers.get(c.pointer)}}));
 const d=ok(await composeTaskDocument(v,value(JSON.parse(normalized)))),expected=ok(composeDocument(v,ok(prepareGeneration(v,q))));const comparable=structuredClone(d);for(const n of Object.values(comparable.nodes))if(n.type==='image'&&n.props.resourceId.startsWith('unavailable-'))n.props.resourceId='';assert.deepEqual(JSON.parse(JSON.stringify(comparable)),JSON.parse(JSON.stringify(expected)));
 const path='/consumer/output/task-bridge-'+prefix+'.pdf',f=await open(path,'wx');const receipt=ok(await engine.generatePdfTo(d,{contract:PDF_STREAM_CONTRACT,images:{},async *open(){throw Error('No images');}},{async write(b){await f.writeFile(b);},async abort(){await f.close();await rm(path,{force:true});}}));await f.close();
 const legacy=ok(await engine.generatePdf(expected));assert.deepEqual(await readFile(path),Buffer.from(legacy.bytes));assert.equal(createHash('sha256').update(legacy.bytes).digest('hex'),receipt.sha256);results.push({prefix,...receipt});
}
await writeFile('/consumer/output/task-composition-result.json',JSON.stringify({status:'PASS',results},null,2)+'\n');
