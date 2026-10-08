import { createHash } from 'node:crypto';
import { readFile, realpath, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { Result } from '../result.js';
import type { ExportResources, ResourceOptions } from './exportResources.js';

const required = ['shaper','segmenter','subset','font-regular','font-bold','font-italic','font-bold-italic','font-license'] as const;
type Entry = {id:string; path:string; sha256:string};
interface Manifest {version:1; platform:'linux'; arch:'x64'; python:'3.11'; fontTools:'4.58.2'; resources:Entry[]}
export interface ProbeDependencies {
  platform: string; arch: string;
  probe: (resources: ExportResources) => Promise<{python:string; fontTools:string}>;
}
function manifestIsValid(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false;
  const m = value as Partial<Manifest>;
  return m.version===1 && m.platform==='linux' && m.arch==='x64' && m.python==='3.11' && m.fontTools==='4.58.2'
    && Array.isArray(m.resources) && m.resources.length===required.length
    && m.resources.every(e => e && typeof e.id==='string' && typeof e.path==='string' && typeof e.sha256==='string' && /^[a-f0-9]{64}$/.test(e.sha256))
    && new Set(m.resources.map(e=>e.id)).size===required.length
    && required.every(id=>m.resources!.some(e=>e.id===id));
}
const failure = (path: string, message: string): Result<never> => ({ok:false,issues:[{code:'RESOURCE_UNAVAILABLE',path,message}],warnings:[]});
function inside(root: string, target: string) { const r=relative(root,target);return r!=='' && !isAbsolute(r) && r!=='..' && !r.startsWith('..'+sep); }
export async function loadResources(root: string, options: ResourceOptions, deps: ProbeDependencies): Promise<Result<ExportResources>> {
  if (deps.platform!=='linux' || deps.arch!=='x64') return failure('platform','Requires Linux x64/glibc runtime');
  if (!options || typeof options.pythonExecutable!=='string' || !options.pythonExecutable.trim()
    || typeof options.tempRoot!=='string' || !isAbsolute(options.tempRoot)) return failure('options','Explicit Python executable and absolute temporary root required');
  let base:string, manifest:Manifest;
  try {base=await realpath(root);const raw:unknown=JSON.parse(await readFile(join(base,'resources.json'),'utf8'));if(!manifestIsValid(raw))return failure('manifest','Invalid resource manifest');manifest=raw;}
  catch {return failure('manifest','Resource manifest is unavailable or malformed');}
  const paths = new Map<string,string>();
  for(const entry of manifest.resources){
    const path=resolve(base,entry.path);
    if(isAbsolute(entry.path)||!inside(base,path))return failure(entry.id,'Resource path escapes package');
    try {
      const actual=await realpath(path);if(!inside(base,actual))return failure(entry.id,'Resource symlink escapes package');
      if(createHash('sha256').update(await readFile(actual)).digest('hex')!==entry.sha256)return failure(entry.id,'Resource hash mismatch');
      paths.set(entry.id,actual);
    } catch {return failure(entry.id,'Resource file is missing or unreadable');}
  }
  let temp:string|undefined;
  try {temp=await mkdtemp(join(options.tempRoot,'flowdoc-check-'));await writeFile(join(temp,'write-check'),'ok');}
  catch {return failure('tempRoot','Temporary root is not writable');}
  finally {if(temp)await rm(temp,{recursive:true,force:true}).catch(()=>{});}
  const value:ExportResources={...options,shaperPath:paths.get('shaper')!,segmenterPath:paths.get('segmenter')!,subsetHelperPath:paths.get('subset')!,
    fonts:manifest.resources.filter(e=>e.id.startsWith('font-')&&e.id!=='font-license').map(e=>({id:e.id,path:paths.get(e.id)!,sha256:e.sha256}))};
  try {const p=await deps.probe(value);if(typeof p.python!=='string'||!p.python.startsWith('3.11.')||p.fontTools!==manifest.fontTools)return failure('runtime','Python 3.11 and fontTools 4.58.2 required');}
  catch {return failure('runtime','Python, fontTools or native executable probe failed');}
  return {ok:true,value,warnings:[]};
}
