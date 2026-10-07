import {it,expect} from 'vitest';
import {readTemplateJson} from '../../src/template/readTemplateJson.js';
it.each(['{"a":1,"a":2}','{"a":1,"\\u0061":2}','{"nested":[{"x":1,"x":2}]}','{"a":}'])('rejects invalid or duplicate raw JSON %s',text=>expect(readTemplateJson(text).ok).toBe(false));
it('accepts escaped values and safely preserves prototype keys',()=>{
 const r=readTemplateJson('{"__proto__":{"a":1},"constructor":2,"x":"\\\"a\\\":1"}');
 expect(r.ok).toBe(true);if(r.ok)expect(Object.hasOwn(r.value as object,'__proto__')).toBe(true);
});
