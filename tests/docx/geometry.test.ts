import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {fonts,staged,noImages} from './helpers.js';
import {bandTemplate} from '../helpers/bands.js';
function composed(template:any,request:any){const v=api.validateTemplate(template);if(!v.ok)throw Error(JSON.stringify(v));const p=api.prepareGeneration(v.value,request);if(!p.ok)throw Error(JSON.stringify(p));const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;}
async function generate(d:api.ResolvedDocument){const e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const sink=staged(),r=await e.value.generateDocxTo(d,noImages,sink.output);if(!r.ok)throw Error(JSON.stringify(r));const z=await JSZip.loadAsync(Buffer.concat(sink.chunks));return {artifact:r.value,xml:await z.file('word/document.xml')!.async('string')};}
it.each(['exact','default','near','mm','one-mismatch'])('retains whole-grid mapping and source geometry: %s',async mode=>{
 const t=JSON.parse(readFileSync('fixtures/table/template.json','utf8')),request=JSON.parse(readFileSync('fixtures/table/short.json','utf8'));
 let index=0;for(const f of Object.values(t.areaFormats) as any[])for(const n of Object.values(f.fragment.nodes) as any[])if(n.type==='table-cell'){
  if(mode!=='default')n.props.padding={top:{unit:'pt',value:4},bottom:{unit:'pt',value:4},left:{unit:'pt',value:4},right:{unit:'pt',value:4}};
  if(mode==='near')n.props.padding.top.value=4.01;
  if(mode==='mm')n.props.padding.top={unit:'mm',value:1.41};
  if(mode==='one-mismatch'&&index++===0)n.props.padding.top.value=3;
 }
 const d=composed(t,request),before=JSON.stringify(d),r=await generate(d),adapted=mode==='exact'||mode==='default';
 const decisions=r.artifact.adaptations.filter((a:any)=>a.kind==='table-space-policy') as any[];expect(decisions.length).toBeGreaterThan(0);expect(decisions.every(a=>a.policy===(adapted?'border-centre-inset':'retain-native'))).toBe(true);
 expect(r.xml.includes('<w:top w:type="dxa" w:w="75"')).toBe(adapted);expect(r.xml).toContain('<w:left w:type="dxa" w:w="80"');expect(r.xml).toContain('w:sz="4"');expect(r.xml).not.toContain('w:trHeight');expect(r.xml).not.toContain('<w:position');expect(JSON.stringify(d)).toBe(before);
});
it.each(['none','all','first','continuation'])('zeroes header distance only when both effective headers are empty: %s',async mode=>{
 const t=bandTemplate();t.sections=[t.sections[0]];t.areaFormats={};t.sections[0].headerMode=mode;
 const d=composed(t,{docKey:t.docKey,data:{projectName:'Body'},sections:{intro:{header:{projectName:'Head'},footer:{projectName:'Foot'}}}}),r=await generate(d);
 const a=r.artifact.adaptations.find((a:any)=>a.kind==='empty-header-space-policy') as any;
 expect(a.policy).toBe(mode==='none'?'empty-header-zero':'retain-h3');expect(a.nativeDistanceTwips===0).toBe(mode==='none');if(mode==='first'||mode==='continuation')expect(a.reason).toBe('mixed-header-visibility');
});
it.each([['normal','normal'],['bold','normal'],['normal','italic'],['bold','italic']])('preserves complex script and explicit emphasis %s/%s without baseline or Exact-line patches',async(weight,style)=>{
 const t=bandTemplate();t.sections=[t.sections[0]];t.areaFormats={};delete t.sections[0].header;delete t.sections[0].footer;
 for(const s of Object.values(t.styles) as any[]){s.fontWeight=weight;s.fontStyle=style;}
 const d=composed(t,{docKey:t.docKey,data:{projectName:'ไทย English ไทย'},sections:{}}),r=await generate(d);
 expect(r.xml).toContain('<w:cs/>');expect(r.xml).toContain(weight==='bold'?'<w:b/>':'<w:b w:val="false"/>');expect(r.xml).toContain(style==='italic'?'<w:i/>':'<w:i w:val="false"/>');
 expect(r.xml).toContain('w:lineRule="atLeast"');expect(r.xml).not.toContain('w:lineRule="exact"');expect(r.xml).not.toContain('<w:position');
});
