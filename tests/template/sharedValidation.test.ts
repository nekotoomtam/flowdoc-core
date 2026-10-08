import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
it('rejects missing styles without throwing at the PDF boundary',()=>{
 const d=JSON.parse(readFileSync('fixtures/pdf/four-styles.resolved.json','utf8'));delete d.styles;
 expect(()=>validateResolvedDocument(d)).not.toThrow();expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
