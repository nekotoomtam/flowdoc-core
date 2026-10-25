import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as api from '@flowdoc/core';

assert.equal(typeof api.createDocxEngine,'function','Installed Core must expose the real DOCX engine');
const entry=fileURLToPath(import.meta.resolve('@flowdoc/core'));
assert(entry.startsWith('/consumer/node_modules/@flowdoc/core/dist/'));
await assert.rejects(access(new URL('../src/index.ts',import.meta.resolve('@flowdoc/core'))));
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.resolve('@flowdoc/core')),'utf8'));
assert.deepEqual(pkg.dependencies,{docx:'9.13.0',jszip:'3.10.2',pngjs:'7.0.0'});
for(const name of ['install','postinstall','prepare'])assert.equal(pkg.scripts[name],undefined);
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const hash=b=>createHash('sha256').update(b).digest('hex');
const base=ok(await api.loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}));
const pdf=ok(await api.createPdfEngine(base)),docx=ok(await api.createDocxEngine(base));
const noImages={contract:api.PDF_STREAM_CONTRACT,images:{},async *open(){throw Error('Unexpected image');}};
const fixture=async name=>JSON.parse(await readFile(name,'utf8'));
const compose=(t,q)=>{const v=ok(api.validateTemplate(t));return ok(api.composeDocument(v,ok(api.prepareGeneration(v,q))));};
function freeze(v){if(v&&typeof v==='object'){Object.freeze(v);for(const x of Object.values(v))freeze(x);}return v;}
function stage(){const chunks=[],aborts=[];return {chunks,aborts,output:{async write(b){assert(b instanceof Uint8Array);assert(b.length<=65536);chunks.push(Buffer.from(b));},async abort(code){aborts.push(code);chunks.length=0;}}};}
const results=[],paths=[];
async function both(name,document,provider=noImages,resources=base){
 freeze(document);const before=JSON.stringify(document),a=stage(),b=stage();
 const de=resources===base?docx:ok(await api.createDocxEngine(resources)),pe=resources===base?pdf:ok(await api.createPdfEngine(resources));
 const dr=ok(await de.generateDocxTo(document,provider,a.output)),pr=ok(await pe.generatePdfTo(document,provider,b.output));
 const db=Buffer.concat(a.chunks),pb=Buffer.concat(b.chunks);
 assert.equal(JSON.stringify(document),before);assert.equal(dr.sha256,hash(db));assert.equal(pr.sha256,hash(pb));assert.equal(dr.byteLength,db.length);assert.equal(pr.byteLength,pb.length);
 assert.equal(dr.pageCount,null);assert.equal(dr.wordVerified,false);assert.equal(dr.fieldRefresh,'required');assert.equal(dr.buffered,true);assert(pr.pageCount>0);assert.equal(a.aborts.length,0);assert.equal(b.aborts.length,0);
 const path='/consumer/output/docx-'+name+'.docx';await writeFile(path,db);await writeFile('/consumer/output/docx-'+name+'.pdf',pb);paths.push(path);
 results.push({name,schemaVersion:document.schemaVersion,nodeModelVersion:document.nodeModelVersion,sourceSha256:hash(before),docx:dr,pdf:pr});return {document,docx:dr,pdf:pr};
}
const references={binding:'7c53233dbb6948891e3300c154b7d5923502dc580aa10bc8ed1f84a1f31c26fc',table:'444fc0aeeab63a129e7b44c3cc8f6a7751e84f8909047f6b6b3e714990014004'};
for(const [prefix,input] of [['binding','request'],['table','short']]){
 const d=compose(await fixture(prefix+'-template.json'),await fixture(prefix+'-'+input+'.json'));
 const r=await both(prefix,d);assert.equal(r.pdf.sha256,references[prefix],'PDF must retain the I0 reference bytes');
}
const t=await fixture('format-sizing-template.json');t.schemaVersion=2;
for(const f of Object.values(t.areaFormats))f.sizing={mode:'auto'};
const releaseId='20000000-0000-4000-8000-000000000001';
for(const key of Object.keys(t.styles))t.styles[key]={font:{kind:'library',releaseId,weight:400,style:'normal'},fontSize:{value:12,unit:'pt'},lineHeightPt:20};
const fontPath='/consumer/docx-font-fixtures/BaiJamjuree-Regular.ttf',license='/consumer/docx-font-fixtures/OFL.txt';
const library=ok(await api.loadLibraryFonts(base,[{releaseId,faceId:'30000000-0000-4000-8000-000000000001',assetId:'40000000-0000-4000-8000-000000000001',weight:400,style:'normal',path:fontPath,sha256:hash(await readFile(fontPath)),licenses:[{id:'OFL-1.1',path:license,sha256:hash(await readFile(license))}]}]));
await both('library-model19',compose(t,await fixture('format-sizing-request.json')),noImages,library);

const id='01a11aa0-c9e6-780a-ae76-834fad559f4d';
for(const kind of ['jpeg','rgb','rgb-alpha']){
 const t=await fixture('binding-template.json');t.globalSchema={type:'object',fields:{photo:{type:'image',required:true}}};t.sections=[t.sections[0]];t.sections[0].inputSchema={type:'object',fields:{}};t.sections[0].formats={};t.areaFormats={};t.sections[0].source={kind:'authored',repeats:[],fragment:{rootIds:['picture'],nodes:{picture:{id:'picture',type:'image',props:{width:{value:100,unit:'pt'},height:{value:60,unit:'pt'},source:{scope:'global',key:'photo'}}}}}};t.examples=[];
 const d=compose(t,{docKey:t.docKey,data:{photo:id},sections:{}}),jpeg=kind==='jpeg',content=jpeg?await readFile('red.jpg'):deflateSync(Buffer.from([255,0,0,0,255,0])),alpha=deflateSync(Buffer.from([255,64]));
 const ref=(b,key)=>({key,byteLength:b.length,sha256:hash(b)});
 let active=0;const provider={contract:api.PDF_STREAM_CONTRACT,images:{[id]:{kind:jpeg?'jpeg':'rgb-deflate',width:jpeg?32:2,height:jpeg?16:1,content:ref(content,'content'),...(kind==='rgb-alpha'?{alpha:ref(alpha,'alpha')}:{})}},async *open(r){active++;try{const b=r.key==='alpha'?alpha:content;for(let at=0;at<b.length;at+=7)yield b.subarray(at,at+7);}finally{active--;}}};
 await both(kind,d,provider);assert.equal(active,0);
}
const small=compose(await fixture('binding-template.json'),await fixture('binding-request.json'));
const cancelled=new AbortController();cancelled.abort();const cancelledSink=stage();
assert.equal((await docx.generateDocxTo(small,noImages,cancelledSink.output,{signal:cancelled.signal})).issues[0].code,'DOCX_CANCELLED');assert.deepEqual(cancelledSink.aborts,['DOCX_CANCELLED']);assert.equal(cancelledSink.chunks.length,0);
const budgetSink=stage();assert.equal((await docx.generateDocxTo(small,noImages,budgetSink.output,{maxBytes:1})).issues[0].code,'DOCX_OUTPUT_BUDGET_EXCEEDED');assert.equal(budgetSink.chunks.length,0);
const failureCodes=[];const failure=await docx.generateDocxTo(small,noImages,{async write(){throw Error('consumer failure');},async abort(code){failureCodes.push(code);}});assert.equal(failure.issues[0].code,'DOCX_SERIALIZATION_FAILED');assert.deepEqual(failureCodes,['DOCX_SERIALIZATION_FAILED']);

const structure=JSON.parse(execFileSync('/usr/local/bin/python',['-c',`
import sys,zipfile,json,posixpath,xml.etree.ElementTree as E
out=[]
for path in sys.argv[1:]:
 with zipfile.ZipFile(path) as z:
  assert z.testzip() is None
  names=set(z.namelist())
  for name in names:
   if name.endswith(('.xml','.rels')): E.fromstring(z.read(name))
   if name.endswith('.rels'):
    prefix='' if name=='_rels/.rels' else posixpath.dirname(posixpath.dirname(name))
    for rel in E.fromstring(z.read(name)):
     if rel.attrib.get('TargetMode')!='External': assert posixpath.normpath(posixpath.join(prefix,rel.attrib['Target'])) in names
  root=E.fromstring(z.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
  text=''.join(root.itertext());assert text.strip() or root.find('.//w:drawing',ns) is not None
  assert any(n.endswith('.odttf') for n in names)
  out.append({'path':path,'xmlValid':True,'relationshipsValid':True,'embeddedFonts':sum(n.endswith('.odttf') for n in names)})
print(json.dumps(out))
`,...paths],{encoding:'utf8'}));
await writeFile('/consumer/output/docx-result.json',JSON.stringify({status:'PASS',entry,packageVersion:pkg.version,dependencies:pkg.dependencies,qualification:'Installed package API and structural acceptance; not Word visual/SRS/release acceptance.',results,structure,cancellation:'PASS',outputCap:'PASS',failureCleanup:'PASS'},null,2)+'\n');
console.log('PASS: installed Core PDF/DOCX small documents, actual fonts/images, cancellation and caps');
