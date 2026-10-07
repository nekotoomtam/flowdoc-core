import assert from 'node:assert/strict';
import { readFile, writeFile, rename, readdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadBundledResources } from '@flowdoc/core';
const exec=promisify(execFile);
const options={pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'};
process.chdir('/tmp');
const ready=await loadBundledResources(options);assert.equal(ready.ok,true,JSON.stringify(ready));
const r=ready.value;assert.equal(r.fonts.length,4);
const text='ทดสอบภาษาไทย น้ำ ปี่ กุ้ง ญู ฐาน FlowDoc 0123456789';
const boundaries=new Set([0]);let count=0;for(const ch of text){count+=Buffer.byteLength(ch);boundaries.add(count);}
const subsetTemp=await mkdtemp(options.tempRoot+'/subset-');
try {
for(const font of r.fonts){
  const shape=JSON.parse((await exec(r.shaperPath,[font.path,text,font.id])).stdout);
  assert.equal(shape.shaperRevision,'rustybuzz-0.20.1');assert.ok(shape.glyphs.length>0);
  assert.ok(shape.glyphs.every(g=>g.glyphId>0 && boundaries.has(g.cluster)));
  assert.equal(createHash('sha256').update(await readFile(font.path)).digest('hex'),font.sha256);
  const request=subsetTemp+'/request.json', output=subsetTemp+'/'+font.id+'.ttf', manifest=subsetTemp+'/manifest.json';
  await writeFile(request,JSON.stringify({fontAssets:[{fontId:font.id,sha256:font.sha256}],paintCommands:[{kind:'glyph-run',fontId:font.id,glyphs:shape.glyphs}]}));
  await exec(r.pythonExecutable,[r.subsetHelperPath,'--request',request,'--font-id',font.id,'--source',font.path,'--subset',output,'--manifest',manifest,'--subset-id',font.id,'--family-name','FlowDoc Test Subset','--postscript-name','FlowDocTestSubset','--subset-prefix','FDTEST']);
  const metadata=JSON.parse(await readFile(manifest,'utf8'));
  assert.ok(metadata.subset.bytes>0 && metadata.subset.bytes<metadata.source.bytes);
  assert.ok(shape.glyphs.every(g=>metadata.subset.retainedGlyphIds.includes(g.glyphId)));
  assert.equal(createHash('sha256').update(await readFile(font.path)).digest('hex'),font.sha256);
  const samePathArgs=[r.subsetHelperPath,'--request',request,'--font-id',font.id,'--source',font.path,'--subset',font.path,'--manifest',manifest,'--subset-id',font.id,'--family-name','FlowDoc Test Subset','--postscript-name','FlowDocTestSubset','--subset-prefix','FDTEST'];
  await assert.rejects(exec(r.pythonExecutable,samePathArgs));
}
} finally { await rm(subsetTemp,{recursive:true,force:true}); }
const segmentation=JSON.parse((await exec(r.segmenterPath,[text])).stdout);
assert.ok(segmentation.breakByteOffsets.every(n=>boundaries.has(n)));
await assert.rejects(import('@flowdoc/core/dist/runtime/loadResources.js'),{code:'ERR_PACKAGE_PATH_NOT_EXPORTED'});
const pkg=JSON.parse(await readFile('/consumer/node_modules/@flowdoc/core/package.json','utf8'));
const expected=JSON.parse(await readFile('/consumer/expected-package.json','utf8'));
assert.equal(pkg.version,expected.version);assert.equal(pkg.name,expected.name);
assert.ok((await readdir('/consumer/node_modules/@flowdoc/core/dist')).includes('index.d.ts'));
for(const forbidden of ['src','tests','native','node_modules','.env','Dockerfile.package']){
  await assert.rejects(stat('/consumer/node_modules/@flowdoc/core/'+forbidden),{code:'ENOENT'});
}
const checkFailure=async (opts,id)=>{const result=await loadBundledResources(opts);assert.equal(result.ok,false);assert.equal(result.issues[0].code,'RESOURCE_UNAVAILABLE');if(id)assert.equal(result.issues[0].path,id);};
for(const [path,id] of [[r.fonts[0].path,r.fonts[0].id],[r.shaperPath,'shaper']]){
  await rename(path,path+'.held');try{await checkFailure(options,id);}finally{await rename(path+'.held',path);}
}
const original=await readFile(r.fonts[1].path);
await writeFile(r.fonts[1].path,'invalid');try{await checkFailure(options,r.fonts[1].id);}finally{await writeFile(r.fonts[1].path,original);}
await checkFailure({...options,pythonExecutable:'/missing-python'},'runtime');
await checkFailure({...options,tempRoot:'/proc'},'tempRoot');
assert.deepEqual(await readdir(options.tempRoot),[]);
assert.equal((await loadBundledResources(options)).ok,true);
console.log(JSON.stringify({status:'PASS',platform:process.platform,arch:process.arch,node:process.version,package:pkg.name,version:pkg.version,fontCount:4,checks:['root import','declarations','private paths','package exclusions','different cwd','four font shaping and subsetting','source font preserved','scalar boundaries','missing font','missing executable','hash mismatch','missing Python','unwritable temp','cleanup']}));
