import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const root=fileURLToPath(new URL('../',import.meta.url));
function docker(args){return execFileSync('docker',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','inherit'],maxBuffer:8*1024*1024});}
const runId=Date.now().toString();const output=join(root,'artifacts',runId);mkdirSync(output,{recursive:true});
docker(['build','--platform','linux/amd64','-f','Dockerfile.package','--target','artifact','--output',`type=local,dest=${output}`,'.']);
const tarball=join(output,'flowdoc-core-0.1.0-dev.1.tgz');if(!existsSync(tarball))throw Error('Missing package artifact');
const checksum=createHash('sha256').update(readFileSync(tarball)).digest('hex');
const context=mkdtempSync(join(tmpdir(),'flowdoc-packed-consumer-'));
for(const file of ['package.json','checkResources.mjs'])copyFileSync(join(root,'tests/consumer',file),join(context,file));
copyFileSync(tarball,join(context,'flowdoc-core.tgz'));
copyFileSync(join(root,'runtime/requirements.txt'),join(context,'requirements.txt'));
copyFileSync(join(root,'Dockerfile.consumer'),join(context,'Dockerfile'));
// Lock only this immutable tarball; Core has no npm runtime dependencies in this slice.
const pkg=JSON.parse(readFileSync(join(context,'package.json'),'utf8'));
const lock={name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages:{'':pkg,'node_modules/@flowdoc/core':{version:'0.1.0-dev.1',resolved:'file:flowdoc-core.tgz',integrity:'sha512-'+createHash('sha512').update(readFileSync(tarball)).digest('base64'),license:'UNLICENSED',engines:{node:'>=24.15.0 <25'}}}};
writeFileSync(join(context,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
copyFileSync(join(context,'package-lock.json'),join(output,'consumer-package-lock.json'));
const tag='flowdoc-core-consumer:'+runId;
docker(['build','--platform','linux/amd64','-t',tag,context]);
const imageId=docker(['image','inspect',tag,'--format','{{.Id}}']).trim();
const result=JSON.parse(docker(['run','--rm','--network','none',imageId]));
if(result.status!=='PASS')throw Error('Consumer failed');
writeFileSync(join(output,'result.json'),JSON.stringify({tarball,checksum,imageId,network:'none',mounts:[],...result},null,2)+'\n');
console.log(JSON.stringify({output,...result}));
