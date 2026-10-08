import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadResources } from '../src/runtime/loadResources.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, {recursive:true,force:true}))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'flowdoc-resource-test-')); roots.push(root);
  const files = ['shaper','segmenter','subset','font-regular','font-bold','font-italic','font-bold-italic','font-license'];
  const entries = [];
  for (const id of files) {
    await writeFile(join(root,id), id);
    entries.push({ id, path:id, sha256:createHash('sha256').update(id).digest('hex') });
  }
  const manifest = {version:1,platform:'linux',arch:'x64',python:'3.11',fontTools:'4.58.2',resources:entries};
  await writeFile(join(root,'resources.json'),JSON.stringify(manifest));
  const temp = join(root,'temp'); await mkdir(temp);
  const options = {pythonExecutable:'python',tempRoot:temp};
  const deps = { platform:'linux',arch:'x64',probe:async () => ({python:'3.11.17',fontTools:'4.58.2'}) };
  return {root,manifest,options,deps};
}
describe('resource boundary', () => {
  it('loads explicit absolute paths, independent of caller cwd', async () => {
    const f = await fixture(); const r = await loadResources(f.root,f.options,f.deps);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.shaperPath).toBe(join(f.root,'shaper')); expect(r.value.fonts).toHaveLength(4); }
  });
  it.each(['font-regular','shaper'])('fails when %s is missing', async id => {
    const f=await fixture(); await rm(join(f.root,id));
    const r=await loadResources(f.root,f.options,f.deps);
    expect(r.ok).toBe(false); if(!r.ok) expect(r.issues).toContainEqual(expect.objectContaining({code:'RESOURCE_UNAVAILABLE',path:id}));
  });
  it('rejects changed font bytes', async () => {
    const f=await fixture(); await writeFile(join(f.root,'font-bold'),'changed');
    const r=await loadResources(f.root,f.options,f.deps); expect(r.ok).toBe(false);
    if(!r.ok)expect(r.issues[0]?.message).toMatch(/hash/i);
  });
  it('rejects unsupported platform before probing', async () => {
    const f=await fixture(); const r=await loadResources(f.root,f.options,{...f.deps,platform:'win32'}); expect(r.ok).toBe(false);
  });
  it.each(['missing executable','Python unavailable','wrong fontTools'])('reports runtime failure: %s', async reason => {
    const f=await fixture(); const probe=async()=>{if(reason==='wrong fontTools')return {python:'3.11.17',fontTools:'0.0'};throw Error(reason);};
    const r=await loadResources(f.root,f.options,{...f.deps,probe});expect(r.ok).toBe(false);
    if(!r.ok)expect(r.issues[0]?.code).toBe('RESOURCE_UNAVAILABLE');
  });
  it('rejects unusable temporary root', async () => {
    const f=await fixture(); const r=await loadResources(f.root,{...f.options,tempRoot:join(f.root,'shaper')},f.deps);expect(r.ok).toBe(false);
  });
  it.each(['../escape','/absolute'])('rejects escaping resource path %s', async path => {
    const f=await fixture();f.manifest.resources[0]!.path=path;
    await writeFile(join(f.root,'resources.json'),JSON.stringify(f.manifest));
    const r=await loadResources(f.root,f.options,f.deps);expect(r.ok).toBe(false);
    if(!r.ok)expect(r.issues[0]?.message).toMatch(/escapes/);
  });
  it('rejects duplicate resource IDs', async () => {
    const f=await fixture();f.manifest.resources[0]!.id=f.manifest.resources[1]!.id;
    await writeFile(join(f.root,'resources.json'),JSON.stringify(f.manifest));
    const r=await loadResources(f.root,f.options,f.deps);expect(r.ok).toBe(false);
  });
  it('returns structured failure for malformed manifest', async () => {
    const f=await fixture();await writeFile(join(f.root,'resources.json'),'{}');
    const r=await loadResources(f.root,f.options,f.deps);expect(r.ok).toBe(false);
  });
});
