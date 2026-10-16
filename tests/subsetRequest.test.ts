import {describe,it,expect} from 'vitest';
import {buildSubsetRequest,fontSubsetPrefix} from '../src/runtime/subsetFonts.js';
import type {DrawDocument} from '../src/pdf/drawContract.js';
describe('compact subset handoff',()=>{
 it('keeps legacy subset names and gives every additional face a unique six-letter PDF prefix',()=>{
  expect(fontSubsetPrefix).toBeTypeOf('function');
  expect(fontSubsetPrefix(0)).toBe('FDPDFA');expect(fontSubsetPrefix(25)).toBe('FDPDFZ');
  const values=Array.from({length:260},(_,n)=>fontSubsetPrefix(n));expect(new Set(values).size).toBe(260);expect(values.every(v=>/^[A-Z]{6}$/.test(v))).toBe(true);
 });
 it('hands actual library identities and license hashes to the subset helper',()=>{
  const selection={releaseId:'release',faceId:'face',assetId:'asset',weight:400,style:'normal' as const},licenses=[{id:'license',path:'/owned/license.txt',sha256:'license-hash'}];
  const draw={pages:[{commands:[{fontId:'library-font',glyphs:[{glyphId:7}]}]}]} as unknown as DrawDocument;
  expect(buildSubsetRequest(draw,[{id:'library-font',sha256:'font-hash',selection,licenses}]).fonts[0]).toMatchObject({fontId:'library-font',sha256:'font-hash',selection,licenses});
 });
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
