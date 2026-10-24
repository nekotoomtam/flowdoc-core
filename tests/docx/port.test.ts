import {describe,expect,it} from 'vitest';
import * as api from '../../src/index.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';

import {fonts,composedFixture,staged,noImages} from './helpers.js';

describe('Core DOCX public port',()=>{
 it.each(['invalid','source'])('rejects an invalid or unavailable explicit text layout: %s',async textLayout=>{
  const e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const sink=staged();
  const r=await e.value.generateDocxTo(composedFixture(),noImages,sink.output,{textLayout:textLayout as any});
  expect(r.ok).toBe(false);if(!r.ok)expect(r.issues[0]?.path).toBe('options.textLayout');expect(sink.chunks).toEqual([]);expect(sink.aborts).toHaveLength(1);
 });
 it.each([['binding-text','request.json'],['table','short.json']])('exports composed %s through the real root API without changing the source',async(name,request)=>{
  expect(api).toHaveProperty('createDocxEngine');
  const doc=composedFixture(name,request),before=JSON.stringify(doc),engine=await api.createDocxEngine(fonts());
  expect(engine.ok,JSON.stringify(engine)).toBe(true);if(!engine.ok)return;
  const sink=staged(),result=await engine.value.generateDocxTo(doc,noImages,sink.output);
  expect(result.ok,JSON.stringify(result)).toBe(true);if(!result.ok)return;
  const bytes=Buffer.concat(sink.chunks);expect(bytes.subarray(0,2).toString()).toBe('PK');
  expect(result.value).toMatchObject({byteLength:bytes.length,pageCount:null,fieldRefresh:'required',wordVerified:false,buffered:true});
  expect(result.value.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
  expect(sink.chunks.every(c=>c.length<=65536)).toBe(true);expect(sink.aborts).toEqual([]);expect(JSON.stringify(doc)).toBe(before);
  const zip=await JSZip.loadAsync(bytes),xml=await zip.file('word/document.xml')!.async('string');
  const text=[...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]!.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')).join('');
  const expected=Object.values(doc.nodes).filter(n=>n.type==='text-block').flatMap(n=>n.children).filter(n=>'text' in n).map(n=>n.text.replace(/[\r\n]/g,'')).join('');
  expect(text.replace(/[\r\n]/g,'')).toBe(expected);
  if(name==='table'){expect(xml).toContain('<w:tbl>');expect(xml).toContain('<w:tblHeader');expect(text).toContain('REQ-001');}
  expect(await zip.file('word/fontTable.xml')!.async('string')).toContain('Sarabun');
 });
});
