import assert from 'node:assert/strict';
import {readFile,writeFile,open,rm,readdir} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {loadBundledResources,createPdfEngine,PDF_STREAM_CONTRACT} from '@flowdoc/core';

assert.equal(PDF_STREAM_CONTRACT,'flowdoc-pdf-stream/1');
const r=await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'});assert(r.ok,JSON.stringify(r));
const initialized=await createPdfEngine(r.value);assert(initialized.ok,JSON.stringify(initialized));const engine=initialized.value;
const fixture=JSON.parse(await readFile('/consumer/stream-images/manifest.json','utf8'));
const manifest=Object.fromEntries(Object.entries(fixture).map(([id,{original,...prepared}])=>[id,prepared]));
let active=0,peakActive=0,maxChunk=0,opens=0,closes=0;
const provider={contract:PDF_STREAM_CONTRACT,images:manifest,async *open(ref,signal){
 const stream=createReadStream(join('/consumer/stream-images',ref.key),{highWaterMark:65536,...(signal?{signal}:{})});active++;opens++;peakActive=Math.max(peakActive,active);
 try{for await(const chunk of stream){maxChunk=Math.max(maxChunk,chunk.length);yield chunk;}}finally{stream.destroy();closes++;active--;}
}};
const source=(id)=>({origin:'authored',sectionId:'main',sourceId:id});
function sample(model){
 const base=JSON.parse(JSON.stringify({schemaVersion:1,nodeModelVersion:model,template:{templateId:'stream-proof',docKey:'stream-proof',version:1},book:{contentSlot:'body',page:{size:'A4',orientation:'portrait',margin:Object.fromEntries(['top','right','bottom','left'].map(k=>[k,{value:20,unit:'mm'}]))}},styles:{body:{fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:12,unit:'pt'},lineHeightPt:18}},rootIds:[],nodes:{},sourceMap:{}}));
 const add=(id,node)=>{base.rootIds.push(id);base.nodes[id]={id,...node};base.sourceMap[id]=source(id);for(const c of node.children??[])base.sourceMap[c.id]=source(c.id);};
 add('toc',{type:'table-of-contents',props:{textStyleId:'body',...(model===19?{scope:{kind:'section'}}:{})}});
 add('jump',{type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'jump-inline',type:'reference',text:'Go to group 6',target:'group5'}]});
 for(let i=0;i<24;i++){
  if(i%4===0)add('heading'+i,{type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:'group'+i/4,toc:{level:1}},children:[{id:'title'+i,type:'text',text:`กลุ่มภาพ Group ${i/4+1}`}]});
  add('caption'+i,{type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'label'+i,type:'text',text:`Image ${String(i).padStart(2,'0')} — ${i%2?'PNG alpha':'JPEG'}`}]});
  add('photo'+i,{type:'image',props:{resourceId:'image'+i,width:{value:i===23?120:200,unit:'pt'},height:{value:100,unit:'pt'}}});
 }
 add('repeat',{type:'image',props:{resourceId:'image0',width:{value:80,unit:'pt'},height:{value:40,unit:'pt'}}});
 add('external',{type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'external-inline',type:'link',text:'External reference',url:'https://example.com/flowdoc'}]});
 const header={baseTextStyleId:'body',rootIds:['logo'],nodes:{logo:{id:'logo',type:'image',props:{resourceId:'image24',width:{value:30,unit:'pt'},height:{value:20,unit:'pt'}}}},sourceMap:{logo:source('logo')}};
 const footer={baseTextStyleId:'body',rootIds:['page'],nodes:{page:{id:'page',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'p-label',type:'text',text:'Page '},{id:'p-current',type:'system-page-field',field:'current',width:{value:24,unit:'pt'}},{id:'p-slash',type:'text',text:' / '},{id:'p-total',type:'system-page-field',field:'total',width:{value:24,unit:'pt'}}]}},sourceMap:Object.fromEntries(['page','p-label','p-current','p-slash','p-total'].map(id=>[id,source(id)]))};
 base.sections=[{sectionId:'main',sourceKind:'authored',role:'body',headerMode:'all',footerMode:'all',header,footer,pageLayoutId:'normal',page:base.book.page,rootIds:base.rootIds}];return base;
}
const results=[];
for(const model of [18,19]){
 const d=sample(model),original=JSON.stringify(d),path=`/consumer/output/stream-images-model${model}.pdf`,file=await open(path,'wx');let aborted=false,bytes=0,writes=0,pendingWrites=0,maxPending=0;
 const sink={async write(chunk){pendingWrites++;maxPending=Math.max(maxPending,pendingWrites);assert(chunk.length<=65536);await new Promise(resolve=>setImmediate(resolve));let offset=0;while(offset<chunk.length){const n=(await file.write(chunk,offset,chunk.length-offset)).bytesWritten;assert(n>0);offset+=n;}bytes+=chunk.length;writes++;pendingWrites--;},async abort(){aborted=true;await file.close();await rm(path,{force:true});}};
 const result=await engine.generatePdfTo(d,provider,sink);assert(result.ok,JSON.stringify(result));await file.close();assert(!aborted);assert.equal(JSON.stringify(d),original);assert.equal(result.warnings.length,0,JSON.stringify(result.warnings));assert.equal(result.value.byteLength,bytes);assert(!('bytes' in result.value));assert.equal(maxPending,1);assert.equal(active,0);assert.equal(opens,closes);
 const content=await readFile(path);assert.equal(createHash('sha256').update(content).digest('hex'),result.value.sha256);const text=content.toString('latin1');assert.equal((text.match(/\/Subtype \/Image/g)??[]).length,37);assert(text.includes('/SMask'));assert(text.includes('/DCTDecode'));assert(text.includes('/Subtype /Link'));assert(text.includes('/URI '));
 results.push({model,...result.value,writes,images:25,alphaMasks:12,placements:25+result.value.pageCount,sourceHashes:Object.fromEntries(Object.entries(fixture).map(([id,f])=>[id,f.original.sha256]))});
 await writeFile(`/consumer/output/stream-images-model${model}.resolved.json`,JSON.stringify(d));
}
assert.equal(peakActive,1);assert(maxChunk<=65536);assert.deepEqual(await readdir('/consumer/temp'),[]);
await writeFile('/consumer/output/streaming-pdf-result.json',JSON.stringify({status:'PASS',contract:PDF_STREAM_CONTRACT,peakActive,maxChunk,opens,closes,results},null,2)+'\n');
