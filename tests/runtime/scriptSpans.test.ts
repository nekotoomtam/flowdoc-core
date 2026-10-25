import {it,expect} from 'vitest';
import {scriptSpans} from '../../src/runtime/scriptSpans.js';
it.each([
 ['', ['']],['AV ffi Á',['AV ffi Á']],['(123) Á ที่ B',['(123) Á ','ที่ ','B']],
 ['ที่ Á น้ำ',['ที่ ','Á ','น้ำ']],['ก 😀 A',['ก 😀 ','A']],['𐐀 ก A',['𐐀 ก A']],
 ['ก ש A',['ก ש A']],['A\u202eที่',['A\u202eที่']],['A\u0e48 ก',['A\u0e48 ','ก']],
 ['\u0301 A ที่',['\u0301 A ','ที่']],['\ud800 A ก',['\ud800 A ก']],
])('keeps text and graphemes while itemizing %j',(text,expected)=>{
 const spans=scriptSpans(text);expect(spans.map(s=>s.text)).toEqual(expected);
 expect(spans.map(s=>s.text).join('')).toBe(text);
 for(const span of spans)expect(text.slice(span.start,span.end)).toBe(span.text);
});
