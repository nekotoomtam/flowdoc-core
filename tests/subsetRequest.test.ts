import {describe,it,expect} from 'vitest';
import {buildSubsetRequest} from '../src/runtime/subsetFonts.js';
import type {DrawDocument} from '../src/pdf/drawContract.js';
describe('compact subset handoff',()=>{
 it('keeps each font isolated, deduplicates glyphs across pages and preserves first-use order',()=>{
  const draw={pages:[{commands:[{kind:'glyph-run',fontId:'bold',text:'private text',glyphs:[{glyphId:9},{glyphId:3},{glyphId:9}]},{kind:'glyph-run',fontId:'regular',glyphs:[{glyphId:8}]}]},{commands:[{kind:'glyph-run',fontId:'bold',glyphs:[{glyphId:2},{glyphId:3}]}]}]} as unknown as DrawDocument;
  const before=JSON.stringify(draw);
  const request=buildSubsetRequest(draw,[{id:'regular',sha256:'r'},{id:'bold',sha256:'b'},{id:'unused',sha256:'u'}]);
  expect(request).toEqual({requestVersion:1,fonts:[{fontId:'bold',sha256:'b',glyphIds:[0,2,3,9]},{fontId:'regular',sha256:'r',glyphIds:[0,8]}]});
  expect(JSON.stringify(request)).not.toContain('private text');expect(JSON.stringify(draw)).toBe(before);
 });
 it('handles a book with no text and rejects missing font resources',()=>{
  expect(buildSubsetRequest({pages:[{commands:[]}]} as unknown as DrawDocument,[])).toEqual({requestVersion:1,fonts:[]});
  expect(()=>buildSubsetRequest({pages:[{commands:[{fontId:'missing',glyphs:[]}]}]} as unknown as DrawDocument,[])).toThrow('Missing font');
 });
});
