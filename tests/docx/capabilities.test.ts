import {describe,expect,it} from 'vitest';
import * as api from '../../src/index.js';
import {fonts,staged,noImages,composedFixture} from './helpers.js';
import {areaCover,composeArea} from '../helpers/areaCover.js';

describe('Core DOCX capability boundary',()=>{
 it('rejects a real composed fixed format budget before writing',async()=>{
  const engine=await api.createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));
  const sink=staged(),doc=composedFixture('format-sizing'),before=JSON.stringify(doc);
  const result=await engine.value.generateDocxTo(doc,noImages,sink.output);
  expect(result.ok).toBe(false);if(!result.ok)expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'DOCX_CAPABILITY_UNSUPPORTED',path:'formatInstances.0'})]));
  expect(sink.chunks).toEqual([]);expect(sink.aborts).toHaveLength(1);expect(JSON.stringify(doc)).toBe(before);
 });
 it('rejects a real composed nonempty fixed-height text block before writing',async()=>{
  expect(api).toHaveProperty('createDocxEngine');
  const engine=await api.createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));
  const sink=staged(),doc=composeArea(areaCover()),before=JSON.stringify(doc);
  const result=await engine.value.generateDocxTo(doc,noImages,sink.output);
  expect(result.ok).toBe(false);if(!result.ok)expect(result.issues.some(i=>i.code==='DOCX_CAPABILITY_UNSUPPORTED')).toBe(true);
  expect(sink.chunks).toEqual([]);expect(sink.aborts).toHaveLength(1);expect(JSON.stringify(doc)).toBe(before);
 });
 it('uses the existing resolved-document validator before DOCX mapping',async()=>{
  expect(api).toHaveProperty('createDocxEngine');
  const engine=await api.createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));
  const sink=staged(),result=await engine.value.generateDocxTo({} as api.ResolvedDocument,noImages,sink.output);
  expect(result.ok).toBe(false);expect(sink.chunks).toEqual([]);expect(sink.aborts).toHaveLength(1);
 });
});
