import {expect,it} from 'vitest';
import {resolve} from 'node:path';
import {mkdtemp,copyFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {fonts,noImages,staged} from './helpers.js';
import {sectionTemplate} from '../helpers/sections.js';

function document(text:string){
 const t=sectionTemplate();t.sections=[t.sections[0]];t.areaFormats={};
 for(const style of Object.values(t.styles) as any[]){style.fontSize={unit:'pt',value:12};style.lineHeightPt=18;}
 const v=api.validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));
 const p=api.prepareGeneration(v.value,{docKey:t.docKey,data:{projectName:text},sections:{}});if(!p.ok)throw Error(JSON.stringify(p));
 const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
async function exported(text:string,withShaper=true){
 const resource={...fonts(),...(withShaper?{shaperPath:resolve('runtime/linux-x64/flowdoc-rustybuzz-smoke')}: {})};
 const engine=await api.createDocxEngine(resource);if(!engine.ok)throw Error(JSON.stringify(engine));
 const d=document(text),before=JSON.stringify(d),sink=staged(),r=await engine.value.generateDocxTo(d,noImages,sink.output);
 if(!r.ok)throw Error(JSON.stringify(r));
 expect(JSON.stringify(d)).toBe(before);
 const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));
 return {xml:await zip.file('word/document.xml')!.async('string'),adaptations:r.value.adaptations};
}
it('uses a private font-bound metric proof for a safe Thai/Latin paragraph',async()=>{
 const r=await exported('Thai English แบ่งบรรทัด');
 const a=r.adaptations.find((a:any)=>a.kind==='text-baseline-policy') as any;
 expect(a?.policy).toBe('font-metric-exact');
 expect(a.sourceBaselinePt).toBeCloseTo(14.016,6);
 expect(a.positionHalfPoints).toBe(1);
 expect(a.wordVerified).toBe(false);
 expect(r.xml).toContain('w:lineRule="exact"');
 expect(r.xml).toContain('<w:position w:val="1"/>');
 // The paragraph mark must stay at its original baseline.
 expect(r.xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/g)?.every(p=>!p.includes('<w:position'))).toBe(true);
});
it('retains native minimum spacing for ink-expanded lower and stacked marks',async()=>{
 const r=await exported('ญู ฐู กิ้');
 const a=r.adaptations.find((a:any)=>a.kind==='text-baseline-policy') as any;
 expect(a?.policy).toBe('retain-native');
 expect(a.reason).toBe('ink-exceeds-line-frame');
 expect(r.xml).toContain('w:lineRule="atLeast"');
 expect(r.xml).not.toContain('<w:position');
});
it('includes real descender ink instead of rejecting the small p overhang',async()=>{
 const r=await exported('w-protected HEADER');
 const a=r.adaptations.find((a:any)=>a.kind==='text-baseline-policy') as any;
 expect(a?.policy).toBe('font-metric-exact');
 expect(a.sourceBaselineMaxPt-a.sourceBaselineMinPt).toBeGreaterThan(0);
 expect(a.sourceBaselineMaxPt-a.sourceBaselineMinPt).toBeLessThanOrEqual(.25);
 expect(a.lowerHeadroomPt).toBeGreaterThan(.3);
});
it('preserves the fonts-only engine behavior without a native shaping capability',async()=>{
 const r=await exported('Thai English แบ่งบรรทัด',false);
 expect(r.xml).toContain('w:lineRule="atLeast"');
 expect(r.xml).not.toContain('<w:position');
 expect(r.adaptations.some((a:any)=>a.kind==='text-baseline-policy')).toBe(false);
});
it('does not reread mutable original font paths when proving or embedding text',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'baseline-owned-test-'));
 try{
  const resource={...fonts(),shaperPath:resolve('runtime/linux-x64/flowdoc-rustybuzz-smoke')};
  for(let index=0;index<resource.fonts.length;index++){
   const font=resource.fonts[index]!,file=join(dir,index+'.ttf');await copyFile(font.path,file);font.path=file;
  }
  const engine=await api.createDocxEngine(resource);if(!engine.ok)throw Error(JSON.stringify(engine));
  await writeFile(resource.fonts[0]!.path,Buffer.alloc(12));
  const sink=staged(),r=await engine.value.generateDocxTo(document('Owned bytes ไทย'),noImages,sink.output);
  if(!r.ok)throw Error(JSON.stringify(r));
  expect(r.value.adaptations.some((a:any)=>a.policy==='font-metric-exact')).toBe(true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('cleans owned native metric fonts after proof and retains fallback for empty authored lines',async()=>{
 const before=(await readdir(tmpdir())).filter(n=>n.startsWith('flowdoc-docx-metrics-')).sort();
 const r=await exported('First\n\nSecond');
 expect(r.adaptations.some((a:any)=>a.reason==='empty-authored-line')).toBe(true);
 expect(r.xml).not.toContain('<w:position');
 await exported('Safe ไทย');
 expect((await readdir(tmpdir())).filter(n=>n.startsWith('flowdoc-docx-metrics-')).sort()).toEqual(before);
});
