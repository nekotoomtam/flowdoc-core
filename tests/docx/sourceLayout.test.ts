import {expect,it,vi} from 'vitest';
import {resolve,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {mkdtemp,copyFile,writeFile,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {fonts,noImages,staged} from './helpers.js';
import {sectionTemplate} from '../helpers/sections.js';
import {bandTemplate} from '../helpers/bands.js';
import {NativeShapeSession} from '../../src/runtime/nativeShapeSession.js';

const native=it.runIf(process.platform==='linux');
native('can retain measured relationships with native editable text and no word boxes',async()=>{
 const d=document(12,false,false,undefined,'ไทย English native flow'),before=JSON.stringify(d),engine=await api.createDocxEngine(resources());if(!engine.ok)throw Error(JSON.stringify(engine));
 const sink=staged(),r=await engine.value.generateDocxTo(d,noImages,sink.output,{textLayout:'native'});expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await z.file('word/document.xml')!.async('string');
 expect(xml).not.toContain('v:shape');expect(z.file('customXml/flowdoc-paragraphs.xml')).toBeNull();
 expect(r.value.adaptations).toContainEqual(expect.objectContaining({kind:'docx-text-layout',requested:'native',policy:'native-paragraphs',wordVerified:false}));
 expect(r.value.adaptations).toContainEqual(expect.objectContaining({kind:'source-reading-measurement'}));expect(JSON.stringify(d)).toBe(before);
});
native.each([false,true])('measures a cover with a fractional rule and a table, retaining its one-page bound: %s',async overflow=>{
 const fixture=(kind:string)=>JSON.parse(readFileSync(`tests/fixtures/docx-pagination-rules/R-${kind}.json`,'utf8'));
 const t=fixture('template');t.nodeModelVersion=18;t.sections=[t.sections[1]];delete t.sections[0].nameBase;Object.assign(t.sections[0],{role:'cover',key:'cover',formats:{}});
 const f=t.sections[0].source.fragment;f.rootIds=['r-space','cover-rule','r-table'];
 f.nodes['r-space'].props={textStyleId:'body'};f.nodes['r-space'].children=[{id:'cover-title-leaf',type:'text',text:overflow?'Long cover '.repeat(500):'I. Revision History'}];
 f.nodes['cover-rule']={id:'cover-rule',type:'line',props:{thickness:{unit:'pt',value:.566929}}};
 const d=composeForMetric(t,{docKey:t.docKey,data:{},sections:{}});
 if(overflow){const e=await api.createDocxEngine(resources());if(!e.ok)throw Error(JSON.stringify(e));const s=staged(),r=await e.value.generateDocxTo(d,noImages,s.output);expect(r.ok).toBe(false);if(!r.ok)expect(r.issues[0]?.message).toContain('Cover exceeds');expect(s.chunks).toEqual([]);return;}
 const r=await exported(d),xml=await r.zip.file('word/document.xml')!.async('string');expect(xml).toContain('w:tbl');expect(xml).toContain('w:sz="5"');
 expect(r.result.adaptations).toContainEqual(expect.objectContaining({kind:'rule-thickness-quantization',sourceThicknessPt:.566929,nativeThicknessPt:.625}));
});
native('measures narrow real text before admitting a heading and first table row',async()=>{
 const fixture=(kind:string)=>JSON.parse(readFileSync(`tests/fixtures/docx-pagination-rules/R-${kind}.json`,'utf8'));
 const t=fixture('template'),f=t.sections[1].source.fragment;
 f.nodes['measured-heading']={id:'measured-heading',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:'measured-heading-anchor',toc:{level:1}},children:[{id:'measured-heading-leaf',type:'text',text:'I. Revision History'}]};
 f.rootIds.splice(f.rootIds.indexOf('r-table'),0,'measured-heading');
 const d=composeForMetric(t,fixture('request')),nodes:any=d.nodes;
 const table:any=Object.values(nodes).find((n:any)=>n.type==='table');
 for(const cid of nodes[table.rowIds[0]].cellIds)nodes[nodes[cid].childIds[0]].children[0].text='i'.repeat(40);
 const r=await exported(d),xml=await r.zip.file('word/document.xml')!.async('string');
 const text=[...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
 expect(xml).toContain('<w:keepNext/>');expect(text).toContain('I. Revision History');expect(text).toContain('i'.repeat(40));
 expect(r.result.adaptations.some((a:any)=>a.kind==='source-reading-measurement'&&a.measuredExtents>0)).toBe(true);
});
native.each(['bounded','custom-padding','whitespace-cell'])('bounds terminal native table stroke compensation: %s',async mode=>{
 const fixture=(kind:string)=>JSON.parse(readFileSync(`tests/fixtures/docx-pagination-rules/W-${kind}.json`,'utf8'));
 const d=composeForMetric(fixture('template'),fixture('request'));
 for(const n of Object.values(d.nodes))if(n.type==='image'){delete d.nodes[n.id];delete d.sourceMap[n.id];d.rootIds=d.rootIds.filter(id=>id!==n.id);for(const s of d.sections!)s.rootIds=s.rootIds.filter(id=>id!==n.id);}
 const table=Object.values(d.nodes).find((n:any)=>n.type==='table'&&n.id.endsWith('~w-protected'))as any;
 const row=d.nodes[table.rowIds.at(-1)]as any,cell=d.nodes[row.cellIds[0]]as any;
 if(mode==='custom-padding')cell.props.padding={bottom:{unit:'pt',value:3}};
 if(mode==='whitespace-cell')(d.nodes[cell.childIds[0]]as any).children[0].text=' ';
 const r=await exported(d),receipt=r.result.adaptations.find((a:any)=>a.nodeId===table.id&&a.scope==='nodes'&&a.cells)as any;
 expect(receipt.terminalStrokeCompensationPt).toBe(mode==='bounded'?.5:0);
 expect(receipt.cells.filter((c:any)=>row.cellIds.includes(c.nodeId)).every((c:any)=>c.nativeBottomTwips===(mode==='bounded'?65:mode==='whitespace-cell'?75:c.sourceBottomTwips))).toBe(true);
});
function composeForMetric(t:any,q:any){
 const v=api.validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));const p=api.prepareGeneration(v.value,q);if(!p.ok)throw Error(JSON.stringify(p));const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
native('keeps authored heading navigation while applying bounded source baseline metrics',async()=>{
 const d=document(12,false,false,undefined,'HEAD');Object.assign((d.nodes[d.rootIds[0]!]as any).props,{anchorId:'metric-heading',toc:{level:1}});const r=await exported(d);
 expect(r.result.adaptations.find((a:any)=>a.kind==='text-baseline-policy')).toMatchObject({policy:'font-metric-exact'});
 const xml=await r.zip.file('word/document.xml')!.async('string');expect(xml).toContain('<w:outlineLvl w:val="0"/>');expect(xml).toContain('<w:bookmarkStart');
});
native('proves plain band and compact page-field baselines without replacing native fields',async()=>{
 const t=bandTemplate();t.sections=[t.sections[0]];t.areaFormats={};for(const style of Object.values(t.styles)as any[]){style.fontSize={unit:'pt',value:12};style.lineHeightPt=18;}const foot=t.sections[0].footer.fragment.nodes.title;foot.props.pageFieldLayout='compact';foot.children.push({id:'current',type:'system-page-field',field:'current',width:{value:36,unit:'pt'}});
 const r=await exported(composeForMetric(t,{docKey:t.docKey,data:{projectName:'BODY'},sections:{intro:{header:{projectName:'HEAD'},footer:{projectName:'PAGE'}}}}));const decisions=r.result.adaptations.filter((a:any)=>a.kind==='text-baseline-policy'&&a.scope!=='nodes');expect(decisions).toHaveLength(2);expect(decisions.every((a:any)=>a.policy==='font-metric-exact')).toBe(true);
 const parts=await Promise.all(Object.keys(r.zip.files).filter(p=>/^word\/(?:header|footer)\d+\.xml$/.test(p)).map(p=>r.zip.file(p)!.async('string')));expect(parts.join('')).toContain('PAGE');expect(parts.join('')).toContain('w:fldChar');const fieldRun=[...parts.join('').matchAll(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g)].find(m=>m[0].includes('PAGE'))![0];expect(fieldRun).toContain('<w:position w:val="0.5pt"/>');expect(parts.join('')).toContain('<w:position w:val="1"/>');
});
native('keeps source pair corrections for individually bounded merged cells in a mixed table',async()=>{
 const fixture=(kind:string)=>JSON.parse(readFileSync(`tests/fixtures/docx-pagination-rules/R-${kind}.json`,'utf8')),t=fixture('template'),f=t.sections[1].source.fragment;f.nodes.rr.cellIds=['rc'];f.nodes.rc.props.colSpan=2;const child=f.nodes.rc.childIds[0];f.nodes[child].children[0].text='AVATAR WAVY';delete f.nodes.rd;delete f.nodes.rdtext;f.nodes['r-table'].props.headerRowCount=1;f.nodes['r-table'].props.repeatHeaderRows=true;
 const r=await exported(composeForMetric(t,fixture('request')));const pairs=r.result.adaptations.filter((a:any)=>a.kind==='font-metric-pair-spacing');expect(pairs.some((a:any)=>a.nodeId.endsWith('~'+child)&&a.pairs>0)).toBe(true);
 const xml=await r.zip.file('word/document.xml')!.async('string');expect(xml).toContain('w:gridSpan');expect(xml).toContain('w:tblHeader');
});
const text='A น้ำ ที่ ลี่ ก๊ำ Invoice 2026-042 ผู้ใช้ตรวจสอบข้อมูลก่อนส่งต่อ '.repeat(8);
function document(size=12,bold=false,italic=false,releaseId?:string,content=text){
 const t=sectionTemplate();t.sections=[t.sections[0]];t.areaFormats={};
 for(const style of Object.values(t.styles)as any[]){style.fontSize={unit:'pt',value:size};style.lineHeightPt=size*1.5;style.fontWeight=bold?'bold':'normal';style.fontStyle=italic?'italic':'normal';}
 if(releaseId){t.schemaVersion=2;for(const key of Object.keys(t.styles))t.styles[key]={font:{kind:'library',releaseId,weight:400,style:'normal'},fontSize:{unit:'pt',value:size},lineHeightPt:size*1.5};}
 const v=api.validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));
 const p=api.prepareGeneration(v.value,{docKey:t.docKey,data:{projectName:content},sections:{}});if(!p.ok)throw Error(JSON.stringify(p));
 const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
native.each(['newline','anchored'])('retains previous metric behavior for a source-guide fallback: %s',async mode=>{
 const d=document(12,false,false,undefined,mode==='newline'?'ABC\nDEF':'ABC DEF');
 if(mode==='anchored')(d.nodes[d.rootIds[0]!]as any).props.anchorId='test-anchor';
 const r=await exported(d),baseline=r.result.adaptations.find((a:any)=>a.kind==='text-baseline-policy')as any;
 expect(baseline?.policy).toBe('font-metric-exact');
 expect(r.result.adaptations.find((a:any)=>a.kind==='source-word-layout')).toMatchObject({policy:'retain-native',sourceParagraphs:0});
});
native('bounds source measurement before starting a native shaper for a long token',async()=>{
 const request=vi.spyOn(NativeShapeSession.prototype,'request');
 try{
  const r=await exported(document(12,false,false,undefined,'A'.repeat(4097)));
  expect(request).not.toHaveBeenCalled();
  const a=r.result.adaptations.find((a:any)=>a.kind==='source-word-layout')as any;
  expect(a).toMatchObject({policy:'retain-native',sourceParagraphs:0});
  expect(a.fallbacks).toContainEqual(expect.objectContaining({reason:'source-measurement-budget'}));
 }finally{request.mockRestore();}
});
native('stops quadratic long-token measurement at its budget and publishes no partial package',async()=>{
 const d=document(12,false,false,undefined,'A'.repeat(4096));
 const page=d.sections![0]!.page;page.margin.left={unit:'pt',value:36};page.margin.right={unit:'pt',value:210*72/25.4-36-12};
 const before=await readdir(tmpdir()),engine=await api.createDocxEngine(resources());if(!engine.ok)throw Error(JSON.stringify(engine));
 const sink=staged(),r=await engine.value.generateDocxTo(d,noImages,sink.output);
 expect(r.ok).toBe(false);if(!r.ok)expect(r.issues[0]?.code).toBe('DOCX_OUTPUT_BUDGET_EXCEEDED');
 expect(sink.chunks).toEqual([]);expect(sink.aborts.length).toBeGreaterThan(0);
 const after=await readdir(tmpdir());expect(after.filter(n=>n.startsWith('flowdoc-docx-source-')&&!before.includes(n))).toEqual([]);
},30000);
function resources(){return {...fonts(),shaperPath:resolve('runtime/linux-x64/flowdoc-rustybuzz-smoke'),segmenterPath:resolve('runtime/linux-x64/flowdoc-icu4x-line-segmenter')};}
async function exported(d:api.ResolvedDocument,r=resources()){
 const engine=await api.createDocxEngine(r);if(!engine.ok)throw Error(JSON.stringify(engine));
 const sink=staged(),before=JSON.stringify(d),result=await engine.value.generateDocxTo(d,noImages,sink.output);
 expect(JSON.stringify(d)).toBe(before);if(!result.ok)throw Error(JSON.stringify(result));
 return {result:result.value,zip:await JSZip.loadAsync(Buffer.concat(sink.chunks))};
}
native.each([10,12,16])('uses shared source measurement and exact logical paragraph identity at %spt',async size=>{
 const d=document(size),r=await exported(d),xml=await r.zip.file('word/document.xml')!.async('string');
 const proof=r.result.adaptations.find((a:any)=>a.kind==='source-word-layout')as any;
 expect(proof?.policy).toBe('source-measured-editable-word-boxes');
 expect(proof?.sourceOnly).toBe(true);expect(proof?.wordVerified).toBe(false);
 expect(xml).toContain('flowdoc-p-');expect(xml).toContain('urn:schemas-microsoft-com:vml');
 const maps=Object.keys(r.zip.files).filter(p=>p.startsWith('customXml/')&&p.endsWith('.xml'));
 expect(maps.length).toBeGreaterThan(0);
 const map=(await Promise.all(maps.map(p=>r.zip.file(p)!.async('string')))).join('');
 expect(map).toContain(d.rootIds[0]);
 const spans=[...map.matchAll(/<line\b[^>]*\bwords="([^"]+)"/g)].flatMap(m=>JSON.parse(m[1]!.replace(/&quot;/g,'"'))as [string,number,number][]);
 expect(spans.length).toBeGreaterThan(0);expect(new Set(spans.map(s=>s[0])).size).toBe(spans.length);
 let offset=0;for(const [,start,end]of spans){expect(start).toBe(offset);expect(end).toBeGreaterThan(start);offset=end;}
 expect(offset).toBe(text.length);
 const styles=await r.zip.file('word/styles.xml')!.async('string');
 const nativeStyles=new Set([...styles.matchAll(/\bw:styleId="([^"]+)"/g)].map(m=>m[1]));
 expect([...xml.matchAll(/<w:(?:rStyle|pStyle)\b[^>]*\bw:val="([^"]+)"/g)].every(m=>nativeStyles.has(m[1]))).toBe(true);
 expect(r.result.adaptations.some((a:any)=>a.maxWordsPerGroup===4)).toBe(false);
});
native.each([[true,false],[false,true],[true,true]])('retains genuine emphasis when laying out editable source words: %s/%s',async(bold,italic)=>{
 const r=await exported(document(12,bold,italic));
 const proof=r.result.adaptations.find((a:any)=>a.kind==='source-word-layout')as any;
 expect(proof?.policy).toBe('source-measured-editable-word-boxes');
 const styles=await r.zip.file('word/styles.xml')!.async('string');
 expect(styles).toContain('Sarabun');
 expect(styles).toContain(bold?'<w:b/>':'<w:b w:val="false"/>');
 expect(styles).toContain(italic?'<w:i/>':'<w:i w:val="false"/>');
});
native('does not silently ignore an unusable requested shared segmenter',async()=>{
 const r=resources();r.segmenterPath=resolve('runtime/linux-x64/no-such-segmenter');
 const engine=await api.createDocxEngine(r);if(!engine.ok)return;
 const sink=staged(),result=await engine.value.generateDocxTo(document(),noImages,sink.output);
 expect(result.ok).toBe(false);expect(sink.chunks).toEqual([]);expect(sink.aborts.length).toBeGreaterThan(0);
});
native('uses real shared capabilities with a genuine Bai Jamjuree library identity',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'source-layout-library-'));
 try{
  const releaseId='20000000-0000-4000-8000-000000000001',path=resolve('tests/docx/fixtures/BaiJamjuree/BaiJamjuree-Regular.ttf'),license=resolve('tests/docx/fixtures/BaiJamjuree/OFL.txt');
  const sha=async(p:string)=>createHash('sha256').update(await readFile(p)).digest('hex');
  const r=await api.loadLibraryFonts({...resources(),tempRoot:directory,pythonExecutable:process.execPath,subsetHelperPath:process.execPath},[{releaseId,faceId:'30000000-0000-4000-8000-000000000001',assetId:'40000000-0000-4000-8000-000000000001',weight:400,style:'normal',path,sha256:await sha(path),licenses:[{id:'OFL-1.1',path:license,sha256:await sha(license)}]}]);
  if(!r.ok)throw Error(JSON.stringify(r));
  const engine=await api.createDocxEngine(r.value);if(!engine.ok)throw Error(JSON.stringify(engine));
  const sink=staged(),result=await engine.value.generateDocxTo(document(12,false,false,releaseId),noImages,sink.output);
  expect(result.ok,JSON.stringify(result)).toBe(true);if(result.ok)expect(result.value.adaptations.some((a:any)=>a.kind==='source-word-layout'&&a.sourceParagraphs>0)).toBe(true);
  const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));expect(await zip.file('word/styles.xml')!.async('string')).toContain('Bai Jamjuree');
 }finally{await rm(directory,{recursive:true,force:true});}
});
native('measures and embeds owned font bytes after original font paths change',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'source-layout-owned-'));
 try{
  const r=resources();
  for(let i=0;i<r.fonts.length;i++){const p=join(dir,'face-'+i+'.ttf');await copyFile(r.fonts[i]!.path,p);r.fonts[i]!.path=p;}
  const engine=await api.createDocxEngine(r);if(!engine.ok)throw Error(JSON.stringify(engine));
  for(const f of r.fonts)await writeFile(f.path,'mutated after engine creation');
  const sink=staged(),result=await engine.value.generateDocxTo(document(),noImages,sink.output);
  expect(result.ok,JSON.stringify(result)).toBe(true);
  if(result.ok)expect(result.value.adaptations.some((a:any)=>a.kind==='source-word-layout')).toBe(true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
native('cancels during source shaping, reaps resources and publishes no partial package',async()=>{
 const engine=await api.createDocxEngine(resources());if(!engine.ok)throw Error(JSON.stringify(engine));
 const prefix='flowdoc-docx-source-',before=(await readdir(tmpdir())).filter(s=>s.startsWith(prefix)).sort();
 const controller=new AbortController(),request=NativeShapeSession.prototype.request;
 const hook=vi.spyOn(NativeShapeSession.prototype,'request').mockImplementationOnce(function(this:NativeShapeSession,...args:Parameters<NativeShapeSession['request']>){controller.abort();return request.apply(this,args);});
 try{
  const sink=staged(),result=await engine.value.generateDocxTo(document(),noImages,sink.output,{signal:controller.signal});
  expect(result.ok).toBe(false);if(!result.ok)expect(result.issues[0]?.code).toBe('DOCX_CANCELLED');
  expect(sink.chunks).toEqual([]);expect(sink.aborts).toContain('DOCX_CANCELLED');
  expect((await readdir(tmpdir())).filter(s=>s.startsWith(prefix)).sort()).toEqual(before);
 }finally{hook.mockRestore();}
});
