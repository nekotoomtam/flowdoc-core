import {expect,it} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {fonts,noImages,staged,composedFixture} from './helpers.js';
it.each([[11.1,11],[8.2,8],[8.4,8.5],[8.1,8],[10.8,11],[11.25,11.5],[12,12]])('maps %s pt to %s pt only in the DOCX snapshot',async(sourcePt,nativePt)=>{
 const d:any=composedFixture(),id=Object.keys(d.styles)[0]!,beforeSize=d.styles[id].fontSize;beforeSize.value=sourcePt;
 const before=JSON.stringify(d),e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));
 const sink=staged(),r=await e.value.generateDocxTo(d,noImages,sink.output);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
 const adaptations=r.value.adaptations.filter((a:any)=>a.kind==='font-size-quantization') as any[];
 if(sourcePt===nativePt)expect(adaptations).toHaveLength(0);else expect(adaptations).toContainEqual(expect.objectContaining({styleId:id,sourcePt,nativePt,errorPt:nativePt-sourcePt,policy:'nearest-half-point'}));
 const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));expect(await zip.file('word/document.xml')!.async('string')).toContain(`w:sz w:val="${nativePt*2}"`);
 expect(JSON.stringify(d)).toBe(before);
});
it.each([0.1,819.1])('does not silently clamp an out-of-range size %s',async value=>{
 const d:any=composedFixture();d.styles[Object.keys(d.styles)[0]!].fontSize.value=value;
 const sink=staged(),e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));
 const r=await e.value.generateDocxTo(d,noImages,sink.output);expect(r.ok).toBe(false);expect(sink.chunks).toEqual([]);
});
