import {it,expect} from 'vitest';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {fonts,noImages,staged} from './helpers.js';
import {sectionTemplate} from '../helpers/sections.js';
import {deriveMetricPairs,neutralMetricPairs,unwrappedAdvancePt} from '../../src/docx/metric-pairs.js';
async function exportText(text:string,shaper=true,split?:number){
 const template=sectionTemplate();template.sections=[template.sections[0]];template.areaFormats={};
 for(const s of Object.values(template.styles) as any[]){s.fontSize={unit:'pt',value:12};s.lineHeightPt=18;}
 if(split!==undefined)template.sections[0].source.fragment.nodes.title.children=[{id:'first',type:'text',text:text.slice(0,split)},{id:'second',type:'text',text:text.slice(split)}];
 const validated=api.validateTemplate(template);if(!validated.ok)throw Error(JSON.stringify(validated));
 const prepared=api.prepareGeneration(validated.value,{docKey:template.docKey,data:{projectName:text},sections:{}});if(!prepared.ok)throw Error(JSON.stringify(prepared));
 const doc=api.composeDocument(validated.value,prepared.value);if(!doc.ok)throw Error(JSON.stringify(doc));
 const frozen=JSON.stringify(doc.value),sink=staged();
 const engine=await api.createDocxEngine({...fonts(),...(shaper?{shaperPath:resolve('runtime/linux-x64/flowdoc-rustybuzz-smoke')}: {})});if(!engine.ok)throw Error(JSON.stringify(engine));
 const result=await engine.value.generateDocxTo(doc.value,noImages,sink.output);if(!result.ok)throw Error(JSON.stringify(result));
 expect(JSON.stringify(doc.value)).toBe(frozen);
 const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));return {xml:await zip.file('word/document.xml')!.async('string'),receipt:result.value};
}
it('maps measured ASCII pair advances without changing native line height or baseline',async()=>{
 const {xml,receipt}=await exportText('AT FA La ไทย');
 expect(xml).toContain('<w:spacing w:val="-14"/>');
 expect(xml).toContain('w:line="360" w:lineRule="exact"');
 expect(xml).toContain('<w:position w:val="1"/>');
 expect(receipt.adaptations.some((a:any)=>a.kind==='font-metric-pair-spacing'&&a.pairs>0&&a.wordVerified===false)).toBe(true);
});
it('rejects a second cluster that covers a ligature instead of one letter',()=>{
 const font=readFileSync('assets/fonts/Sarabun-Regular.ttf');
 const glyph=(cluster:number,glyphId:number,xAdvance:number)=>({cluster,glyphId,xAdvance,xOffset:0,yOffset:0});
 // Pinned A nominal596, T558. The synthetic second cluster covers Tf.
 const raw={unitsPerEm:1000,glyphs:[glyph(0,4,536),glyph(1,158,558)]};
 expect(deriveMetricPairs('AT',raw,font,12).get(0)).toBe(-14);
 expect(deriveMetricPairs('ATf',raw,font,12).size).toBe(0);
});
it('converts UTF8 clusters after Thai to semantic UTF16 character offsets',()=>{
 const font=readFileSync('assets/fonts/Sarabun-Regular.ttf');
 const raw={unitsPerEm:1000,glyphs:[{cluster:10,glyphId:4,xAdvance:536,xOffset:0,yOffset:0},{cluster:11,glyphId:158,xAdvance:558,xOffset:0,yOffset:0}]};
 expect([...deriveMetricPairs('ไทย AT',raw,font,12)]).toEqual([[4,-14]]);
});
it('does not claim native unwrapped width from substituted multiscalar clusters',()=>{
 const font=readFileSync('assets/fonts/Sarabun-Regular.ttf');
 const raw={text:'ATf',unitsPerEm:1000,glyphs:[{cluster:0,glyphId:4,xAdvance:536,xOffset:0,yOffset:0},{cluster:1,glyphId:158,xAdvance:558,xOffset:0,yOffset:0}]};
 expect(Number.isFinite(unwrappedAdvancePt(raw,font,12))).toBe(false);
});
it('keeps authored span boundaries and authored newlines intact',async()=>{
 const split=await exportText('AT',true,1);
 expect(split.xml).not.toContain('<w:spacing w:val=');
 const lines=await exportText('AT\nAT');
 expect(lines.xml.match(/<w:spacing w:val="-14"\/>/g)).toHaveLength(2);
 expect(lines.xml.match(/<w:br\/>/g)).toHaveLength(1);
});
it('leaves Thai cluster runs intact and never assigns tracking to their marks',async()=>{
 const {xml}=await exportText('AT ไทย');
 expect(xml).toContain('<w:spacing w:val="-14"/>');
 const runs=xml.match(/<w:r>[\s\S]*?<\/w:r>/g)??[];
 const thai=runs.filter(s=>/[\u0e00-\u0e7f]/u.test(s));
 expect(thai.length).toBeGreaterThan(0);
 expect(thai.every(s=>!s.includes('<w:spacing'))).toBe(true);
 expect(thai.some(s=>s.includes('ไทย'))).toBe(true);
});
it('retains the baseline fallback and no pair tracking for an unsafe expanded-mark paragraph',async()=>{
 const {xml,receipt}=await exportText('AT ญู ฐู');
 expect(xml).toContain('w:lineRule="atLeast"');
 expect(xml).not.toContain('<w:spacing w:val=');
 expect(receipt.adaptations.some((a:any)=>a.kind==='font-metric-pair-spacing')).toBe(false);
});
it('keeps fonts-only callers and nonkerning ASCII text unchanged',async()=>{
 for(const [text,shaper] of [['AT FA',false],['HHHH',true]] as const){
  const {xml,receipt}=await exportText(text,shaper);
  expect(xml).not.toContain('<w:spacing w:val=');
  expect(receipt.adaptations.some((a:any)=>a.kind==='font-metric-pair-spacing')).toBe(false);
 }
});
it('conserves ASCII word advance when Thai mark clusters make native wrapping uncertain',async()=>{
 const {xml,receipt}=await exportText('AT '+ 'ษัษิษี'.repeat(35));
 const tracking=[...xml.matchAll(/<w:spacing w:val="(-?\d+)"\/>/g)].map(m=>Number(m[1]));
 expect(tracking).toEqual([-14,14]);
 expect(receipt.adaptations.some((a:any)=>a.kind==='font-metric-pair-spacing'&&a.widthPolicy==='preserve-ascii-word-advance')).toBe(true);
 expect((xml.match(/<w:r>[\s\S]*?<\/w:r>/g)??[]).filter(s=>/[\u0e00-\u0e7f]/u.test(s)).every(s=>!s.includes('<w:spacing'))).toBe(true);
});

it('neutral tracking rejects a word containing a substituted multiscalar cluster',()=>{
 const font=readFileSync('assets/fonts/Sarabun-Regular.ttf');
 const glyph=(cluster:number,glyphId:number,xAdvance:number)=>({cluster,glyphId,xAdvance,xOffset:0,yOffset:0});
 const raw={unitsPerEm:1000,glyphs:[glyph(0,4,536),glyph(1,158,558)]};
 expect([...neutralMetricPairs('AT',raw,font,12)]).toEqual([[0,-14],[1,14]]);
 expect(neutralMetricPairs('ATf',raw,font,12).size).toBe(0);
});
it('neutral compensation never crosses an authored span boundary',async()=>{
 const {xml}=await exportText('AT กิ',true,1);
 expect(xml).not.toContain('<w:spacing w:val=');
});
it('admits source advances for body tokens bounded by the pinned font envelope',async()=>{
 const {xml,receipt}=await exportText('AT แบ่งบรรทัด');
 expect([...xml.matchAll(/<w:spacing w:val="(-?\d+)"\/>/g)].map(m=>Number(m[1]))).toEqual([-14]);
 expect(receipt.adaptations.some((a:any)=>a.kind==='font-metric-pair-spacing'&&a.widthPolicy==='bounded-token-source-advance')).toBe(true);
});

it('keeps Thai word clusters and source text while isolating native zero-spacing boundaries',async()=>{
 const text='การแบ่งบรรทัดภาษาไทยต้องรักษาข้อความและเครื่องหมายให้ครบถ้วน'.repeat(2);
 const {xml,receipt}=await exportText(text);
 const runs=(xml.match(/<w:r>[\s\S]*?<\/w:r>/g)??[]).filter(r=>/[\u0e00-\u0e7f]/u.test(r));
 expect(runs.length).toBeGreaterThan(1);
 expect(runs.some(r=>r.includes('<w:spacing w:val="0"/>'))).toBe(true);
 expect(runs.some(r=>!r.includes('<w:spacing'))).toBe(true);
 expect(runs.every(r=>!/<w:spacing w:val="(?!0")/.test(r))).toBe(true);
 expect(runs.map(r=>r.match(/<w:t[^>]*>([^<]*)<\/w:t>/)?.[1]??'').join('')).toBe(text);
 const wordEnds=new Set([...new Intl.Segmenter('th',{granularity:'word'}).segment(text)].map(s=>s.index+s.segment.length));
 let end=0;for(const r of runs){end+=(r.match(/<w:t[^>]*>([^<]*)<\/w:t>/)?.[1]??'').length;expect(wordEnds.has(end)).toBe(true);}
 expect(receipt.adaptations.some((a:any)=>a.kind==='thai-word-boundary-policy'&&a.policy==='alternating-native-zero-spacing'&&a.wordVerified===false)).toBe(true);
 expect(xml).toContain('w:lineRule="atLeast"');
});
it('does not isolate Thai words across source spans or mixed-script and fonts-only contexts',async()=>{
 const thai='การแบ่งบรรทัดภาษาไทยต้องรักษาข้อความและเครื่องหมายให้ครบถ้วน';
 for(const [text,shaper,split]of [[thai,false,undefined],['AT '+thai,true,undefined],[thai,true,3]] as const){
  const {xml,receipt}=await exportText(text,shaper,split);
  expect(receipt.adaptations.some((a:any)=>a.kind==='thai-word-boundary-policy')).toBe(false);
  expect((xml.match(/<w:r>[\s\S]*?<\/w:r>/g)??[]).filter(r=>/[\u0e00-\u0e7f]/u.test(r)).every(r=>!r.includes('<w:spacing'))).toBe(true);
 }
});

it('bounds native Thai measurement windows to at most four complete source words',async()=>{
 const text='การแบ่งบรรทัดภาษาไทยต้องรักษาข้อความและเครื่องหมายให้ครบถ้วน'.repeat(2);
 const {xml,receipt}=await exportText(text);
 const words=[...new Intl.Segmenter('th',{granularity:'word'}).segment(text)].map(s=>s.segment);
 const firstWindow=words.slice(0,4).join('');
 const runs=(xml.match(/<w:r>[\s\S]*?<\/w:r>/g)??[]).filter(r=>/[\u0e00-\u0e7f]/u.test(r));
 const texts=runs.map(r=>r.match(/<w:t[^>]*>([^<]*)<\/w:t>/)?.[1]??'');
 expect(texts[0]).toBe(firstWindow);expect(texts.join('')).toBe(text);
 const counts:number[]=[];let index=0;
 for(const t of texts){let joined='',count=0;while(joined.length<t.length){joined+=words[index++]!;count++;}
  expect(joined).toBe(t);expect(count).toBeLessThanOrEqual(4);expect(t.length).toBeLessThanOrEqual(21);counts.push(count);
 }
 // This20mm-margin A4 fixture fits21 envelope characters at pinned12pt.
 // The four words following the fifth group exceed that width; keep a
 // shorter complete-word group instead of weakening the existing envelope.
 expect(counts.slice(0,-1).some(n=>n<4)).toBe(true);
 expect(receipt.adaptations.some((a:any)=>a.kind==='thai-word-boundary-policy'&&a.maxWordsPerGroup===4&&a.words===words.length&&a.groups===texts.length&&a.wordVerified===false)).toBe(true);
});
