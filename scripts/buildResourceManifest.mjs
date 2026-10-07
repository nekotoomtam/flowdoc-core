import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const entries=[['shaper','runtime/linux-x64/flowdoc-rustybuzz-smoke'],['segmenter','runtime/linux-x64/flowdoc-icu4x-line-segmenter'],['subset','runtime/python/fontSubset.py'],['font-regular','assets/fonts/Sarabun-Regular.ttf'],['font-bold','assets/fonts/Sarabun-Bold.ttf'],['font-italic','assets/fonts/Sarabun-Italic.ttf'],['font-bold-italic','assets/fonts/Sarabun-BoldItalic.ttf'],['font-license','assets/fonts/OFL.txt']];
const resources=entries.map(([id,path])=>({id,path,sha256:createHash('sha256').update(readFileSync(join(root,path))).digest('hex')}));
writeFileSync(join(root,'resources.json'),JSON.stringify({version:1,platform:'linux',arch:'x64',python:'3.11',fontTools:'4.58.2',resources},null,2)+'\n');
