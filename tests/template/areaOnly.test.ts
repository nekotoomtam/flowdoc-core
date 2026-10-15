import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {ownedTemplate} from '../helpers/sectionOwnership.js';
const fixture=()=>JSON.parse(readFileSync(new URL('../../fixtures/area-document/template.json',import.meta.url),'utf8'));
describe('0.3.0 Area18-only public contract',()=>{
 it('rejects a formerly valid scoped template',()=>expect(validateTemplate({...ownedTemplate(),nodeModelVersion:15}).ok).toBe(false));
 it('rejects a formerly valid content template',()=>expect(validateTemplate({...fixture(),nodeModelVersion:4}).ok).toBe(false));
 it('accepts the authored Area18 fixture',()=>expect(validateTemplate(fixture()).ok).toBe(true));
 for(let version=4;version<18;version++)it(`rejects retired model ${version}`,()=>{
  const t=fixture();t.nodeModelVersion=version;
  expect(validateTemplate(t).ok).toBe(false);
 });
});
