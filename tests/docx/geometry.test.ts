import {imageId,imageProvider} from './imageFixtures.js';
import {mergedTemplate} from '../helpers/merged.js';
import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {fonts,staged,noImages} from './helpers.js';
import {bandTemplate} from '../helpers/bands.js';
function composed(template:any,request:any){const v=api.validateTemplate(template);if(!v.ok)throw Error(JSON.stringify(v));const p=api.prepareGeneration(v.value,request);if(!p.ok)throw Error(JSON.stringify(p));const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;}
async function generate(d:api.ResolvedDocument,provider:api.PdfImageProvider=noImages,metrics=false){const e=await api.createDocxEngine({...fonts(),...(metrics?{shaperPath:resolve('runtime/linux-x64/flowdoc-rustybuzz-smoke')}: {})});if(!e.ok)throw Error(JSON.stringify(e));const sink=staged(),r=await e.value.generateDocxTo(d,provider,sink.output);if(!r.ok)throw Error(JSON.stringify(r));const z=await JSZip.loadAsync(Buffer.concat(sink.chunks));return {artifact:r.value,zip:z,xml:await z.file('word/document.xml')!.async('string')};}
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
it.each(['safe','unsafe-mark','different-padding','long-wrap','ligature'])('bounds the measured horizontal half-stroke inset: %s',async mode=>{
 const t=mergedTemplate(),nodes=t.areaFormats.merged.fragment.nodes;
 for(const style of Object.values(t.styles) as any[]){style.fontSize={unit:'pt',value:12};style.lineHeightPt=18;}
 if(mode==='unsafe-mark')nodes.at.children=[{id:'unsafe',type:'text',text:'ญู ฐู'}];
 if(mode==='different-padding')nodes.a.props.padding={left:{unit:'pt',value:3},right:{unit:'pt',value:4},top:{unit:'pt',value:4},bottom:{unit:'pt',value:4}};
 if(mode==='long-wrap')nodes.at.children=[{id:'long',type:'text',text:'AT '.repeat(80)}];
 if(mode==='ligature')nodes.at.children=[{id:'ligature',type:'text',text:'first AT'}];
 const d=composed(t,{docKey:'merged',data:{},sections:{main:{data:{details:[{format:'merged',data:{}}]}}}}),before=JSON.stringify(d),r=await generate(d,noImages,true);
 const policy=r.artifact.adaptations.find((a:any)=>a.kind==='table-space-policy') as any;
 const preserved=mode==='long-wrap'||mode==='ligature';
 expect(policy.horizontalPolicy).toBe(mode==='safe'?'border-centre-inset':preserved?'border-centre-inset-preserve-width':'retain-native');
 if(mode==='safe')expect(policy.cells.every((c:any)=>c.nativeLeftTwips===75&&c.nativeRightTwips===75)).toBe(true);
 else if(preserved)expect(policy.cells.every((c:any)=>c.nativeLeftTwips===75&&c.nativeRightTwips===85&&c.nativeLeftTwips+c.nativeRightTwips===c.sourceLeftTwips+c.sourceRightTwips)).toBe(true);
 else expect(policy.cells.every((c:any)=>c.nativeLeftTwips===c.sourceLeftTwips&&c.nativeRightTwips===c.sourceRightTwips)).toBe(true);
 if(mode==='long-wrap')expect(r.xml).not.toContain('<w:spacing w:val=');
 expect(JSON.stringify(d)).toBe(before);
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

it.each(['merged','padding-mismatch'])('bounds merged-grid border mapping without altering topology: %s',async mode=>{
 const t=mergedTemplate(),n=t.areaFormats.merged.fragment.nodes;
 if(mode==='padding-mismatch')n.a.props.padding={top:{unit:'pt',value:3},bottom:{unit:'pt',value:4},left:{unit:'pt',value:4},right:{unit:'pt',value:4}};
 const d=composed(t,{docKey:'merged',data:{},sections:{main:{data:{details:[{format:'merged',data:{}}]}}}}),before=JSON.stringify(d),r=await generate(d);
 const policy=r.artifact.adaptations.find((a:any)=>a.kind==='table-space-policy') as any;
 expect(policy.policy).toBe(mode==='merged'?'border-centre-inset':'retain-native');
 expect(r.xml).toContain('<w:gridSpan w:val="3"/>');expect(r.xml).toContain('<w:gridSpan w:val="2"/>');
 expect(r.xml).toContain('<w:vMerge w:val="restart"/>');expect(r.xml).toContain('<w:vMerge w:val="continue"/>');
 const continuation=(r.xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[]).find(c=>c.includes('<w:vMerge w:val="continue"/>'));expect(continuation).toContain('<w:top w:type="dxa" w:w="'+(mode==='merged'?75:60)+'"/>');
 expect(r.xml).toContain('<w:tblHeader/>');expect(r.xml).not.toContain('w:trHeight');
 expect(policy.cells.every((c:any)=>c.nativeTopTwips===c.sourceTopTwips-(mode==='merged'?5:0)&&c.nativeBottomTwips===c.sourceBottomTwips-(mode==='merged'?5:0))).toBe(true);
 expect(JSON.stringify(d)).toBe(before);
});

it('does not expand the fixed-height cell capability',()=>{
 const t=mergedTemplate();Object.assign(t.areaFormats.merged.fragment.nodes.at.props,{heightMode:'fixed',height:{unit:'pt',value:60},verticalAlign:'top'});
 expect(api.validateTemplate(t).ok).toBe(false);
});

it('retains native padding for a valid merged grid containing an image',async()=>{
 const t=mergedTemplate(),n=t.areaFormats.merged.fragment.nodes;
 t.globalSchema.fields.photo={type:'image',required:true};n.b.childIds=['pic'];delete n.bt;
 n.pic={id:'pic',type:'image',props:{width:{unit:'pt',value:100},height:{unit:'pt',value:30},source:{scope:'global',key:'photo'}}};
 const d=composed(t,{docKey:'merged',data:{photo:imageId},sections:{main:{data:{details:[{format:'merged',data:{}}]}}}}),before=JSON.stringify(d),r=await generate(d,imageProvider().provider);
 const policy=r.artifact.adaptations.find((a:any)=>a.kind==='table-space-policy') as any;
 expect(policy.policy).toBe('retain-native');expect(r.xml).toContain('<w:drawing>');
 expect(policy.cells.every((c:any)=>c.nativeTopTwips===80&&c.nativeBottomTwips===80)).toBe(true);expect(JSON.stringify(d)).toBe(before);
});

it.each(['absent','none','all','first','continuation'])('keeps an empty footer out of the body edge, preserving visible or mixed footers: %s',async mode=>{
 const t=bandTemplate();t.sections=[t.sections[0]];t.areaFormats={};delete t.sections[0].header;
 t.sections[0].footerMode=mode==='absent'?'all':mode;if(mode==='absent')delete t.sections[0].footer;
 const d=composed(t,{docKey:t.docKey,data:{projectName:'BODY'},sections:{intro:{footer:{projectName:'FOOT'}}}}),before=JSON.stringify(d),r=await generate(d);
 const policy=r.artifact.adaptations.find((a:any)=>a.kind==='empty-footer-space-policy') as any,empty=mode==='absent'||mode==='none';
 const footerParts=await Promise.all(Object.keys(r.zip.files).filter(name=>/^word\/footer\d+\.xml$/.test(name)).map(name=>r.zip.file(name)!.async('string')));
 expect(footerParts.filter(xml=>xml.includes('>FOOT</w:t>')).length).toBe(empty?0:mode==='all'?2:1);
 expect(policy).toBeDefined();
 expect(policy.policy).toBe(empty?'empty-footer-zero':'retain-footer-distance');
 expect(policy.nativeDistanceTwips).toBe(empty?0:policy.sourceOffsetTwips);
 expect(r.xml).toContain('w:footer="'+policy.nativeDistanceTwips+'"');
 expect(JSON.stringify(d)).toBe(before);
});
