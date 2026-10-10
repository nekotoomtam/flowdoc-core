import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('public package', () => {
  it('exposes resource loading at the root without a pretend PDF engine', async () => {
    const api = await import('../src/index.js');
    expect(Object.keys(api).sort()).toEqual(['composeDocument','createPdfEngine','loadBundledResources','prepareGeneration','readGenerationJson','validateTemplate']);
  });
  it('allows only intended entrypoint and shipped files; never builds on install', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(Object.keys(pkg.exports)).toEqual(['.']);
    expect(pkg.files).not.toContain('src');
    expect(pkg.scripts.postinstall).toBeUndefined();
    expect(pkg.scripts.prepare).toBeUndefined();
  });
});
