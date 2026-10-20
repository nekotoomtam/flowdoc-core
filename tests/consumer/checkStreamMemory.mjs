import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {writeFile,readFile,open,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {loadBundledResources,createPdfEngine,PDF_STREAM_CONTRACT} from '@flowdoc/core';
assert.equal(typeof global.gc,'function','Retained-buffer proof needs explicit GC');
const r=await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'});assert(r.ok);const e=await createPdfEngine(r.value);assert(e.ok);
const source='/consumer/temp/stress-rgb.z';
async function make(){const b=deflateSync(randomBytes(512*512*3));await writeFile(source,b);return {key:'stress-source',byteLength:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
const reference=await make(),runs=[];
try{for(const count of [10,100,10]){
 const d=JSON.parse(await readFile('/consumer/four-styles.resolved.json','utf8'));d.nodeModelVersion=18;d.nodes={};d.sourceMap={};d.rootIds=[];
 const images={};for(let i=0;i<count;i++){const id='stress'+i;images[id]={kind:'rgb-deflate',width:512,height:512,content:reference};d.nodes[id]={id,type:'image',props:{resourceId:id,width:{value:100,unit:'pt'},height:{value:100,unit:'pt'}}};d.rootIds.push(id);d.sourceMap[id]={origin:'authored',sectionId:d.sections[0].sectionId,sourceId:id};}d.sections[0].rootIds=d.rootIds;d.sections[0].sourceKind='authored';
 let active=0,peakActive=0,reads=0;const provider={contract:PDF_STREAM_CONTRACT,images,async *open(ref){assert.equal(ref.sha256,reference.sha256);active++;peakActive=Math.max(peakActive,active);const stream=createReadStream(source,{highWaterMark:65536});try{for await(const b of stream){reads++;yield b;}}finally{stream.destroy();active--;}}};
 global.gc();const before=process.memoryUsage();let retainedArrayBuffers=0,peakRss=before.rss,writes=0,bytes=0;const filePath=`/consumer/output/stress-${runs.length}-${count}.pdf`,file=await open(filePath,'wx');
 const out={async write(b){await file.write(b);bytes+=b.length;writes++;if(writes%16===0){global.gc();const m=process.memoryUsage();retainedArrayBuffers=Math.max(retainedArrayBuffers,m.arrayBuffers);peakRss=Math.max(peakRss,m.rss);}},async abort(){await file.close();await rm(filePath,{force:true});}};
 const result=await e.value.generatePdfTo(d,provider,out);assert(result.ok,JSON.stringify(result));await file.close();global.gc();const after=process.memoryUsage();assert.equal(result.value.byteLength,bytes);assert.equal(active,0);assert.equal(peakActive,1);
 // This isolates retained image/output buffers. It is not the Service memory group test.
 assert(retainedArrayBuffers<16*1048576,JSON.stringify({retainedArrayBuffers,count}));
 const hash=createHash('sha256');for await(const b of createReadStream(filePath,{highWaterMark:65536}))hash.update(b);assert.equal(hash.digest('hex'),result.value.sha256);
 runs.push({count,...result.value,before,after,retainedArrayBuffers,peakRss,peakActive,reads,writes});
 // Stress artifacts are verified above; keep only the two small review PDFs.
 await rm(filePath);
}}finally{await rm(source,{force:true});}
await writeFile('/consumer/output/stream-memory-result.json',JSON.stringify({status:'PASS',scope:'Core retained buffers with GC; not whole Service process group',runs},null,2)+'\n');
