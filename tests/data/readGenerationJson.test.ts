import {it,expect} from 'vitest';
import * as api from '../../src/index.js';
it('rejects duplicate decoded keys while allowing different objects',()=>{
 const read=(api as any).readGenerationJson;expect(typeof read).toBe('function');
 expect(read('{"x":1,"x":2}').ok).toBe(false);
 expect(read('{"x":1,"\\u0078":2}').ok).toBe(false);
 expect(read('{"a":{"x":1},"b":{"x":2}}').ok).toBe(true);
 expect(read('{').issues[0].code).toBe('INVALID_DATA');
});
