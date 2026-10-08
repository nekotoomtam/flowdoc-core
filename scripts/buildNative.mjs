import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(process.platform!=='linux'||process.arch!=='x64')throw Error('Build native resources in Linux amd64 container');
const r=spawnSync('cargo',['build','--locked','--release','--bin','flowdoc-rustybuzz-smoke','--bin','flowdoc-icu4x-line-segmenter'],{cwd:join(root,'native'),stdio:'inherit'});
if(r.status!==0)throw Error('Native build failed');
mkdirSync(join(root,'runtime/linux-x64'),{recursive:true});
for(const name of ['flowdoc-rustybuzz-smoke','flowdoc-icu4x-line-segmenter']){const target=join(root,'runtime/linux-x64',name);copyFileSync(join(root,'native/target/release',name),target);chmodSync(target,0o755);}
