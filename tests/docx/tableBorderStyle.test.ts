import {expect,it} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {mergedTemplate,mergedDoc} from '../helpers/merged.js';
import {groupLabelTemplate,groupLabelRequest} from '../helpers/groupLabels.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {fonts,noImages,staged} from './helpers.js';
function take<T>(r:api.Result<T>):T{if(!r.ok)throw Error(JSON.stringify(r));return r.value;}
const request=(t:any)=>({docKey:t.docKey,data:{},sections:{main:{data:{details:[{format:'merged',data:{}}]}}}});
function composed(t:any){const v=take(api.validateTemplate(t));return take(api.composeDocument(v,take(api.prepareGeneration(v,request(t)))));}
async function exported(t:any){
 const d=composed(t),before=JSON.stringify(d),sink=staged();
 take(await take(await api.createDocxEngine(fonts())).generateDocxTo(d,noImages,sink.output));
 expect(JSON.stringify(d)).toBe(before);
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks));return z.file('word/document.xml')!.async('string');
}
it('exports none on both table and merged cell borders without changing other DOCX instructions',async()=>{
 const t=mergedTemplate(),visible=await exported(t);t.areaFormats.merged.fragment.nodes.table.props.borderStyle='none';
 const hidden=await exported(t),sets=hidden.match(/<w:(?:tc|tbl)Borders>[\s\S]*?<\/w:(?:tc|tbl)Borders>/g)??[];
 expect(sets).toHaveLength(7);
 for(const set of sets){expect(set).not.toContain('w:val="single"');expect(set).toContain('w:val="none"');}
 const strip=(s:string)=>s.replace(/<w:(?:tc|tbl)Borders>[\s\S]*?<\/w:(?:tc|tbl)Borders>/g,'');
 expect(strip(hidden)).toBe(strip(visible));
});
it.each([undefined,'single'])('keeps half-point black defaults for %s',async style=>{
 const t=mergedTemplate();if(style)t.areaFormats.merged.fragment.nodes.table.props.borderStyle=style;
 const xml=await exported(t);expect(xml).toContain('<w:top w:val="single" w:color="000000" w:sz="4"/>');
});
it('preserves explicit white as a painted border rather than treating it as none',async()=>{
 const t=mergedTemplate();t.areaFormats.merged.fragment.nodes.table.props.borderColor='FFFFFF';
 const xml=await exported(t);expect(xml).toContain('<w:top w:val="single" w:color="FFFFFF" w:sz="4"/>');
 const d=composed(t),draw=await documentFlow(d,fakeRuntime);expect(draw.pages.flatMap(p=>p.borders??[]).every(b=>b.color==='FFFFFF'&&b.widthPt===.5)).toBe(true);
});
it('suppresses PDF table strokes across pages while preserving fills, text, spans and unrelated rules',async()=>{
 const d=mergedDoc(100);d.nodes.table.props.headerFillColor='DDEEFF';d.nodes.b.props.fillColor='ABCDEF';
 d.nodes.rule={id:'rule',type:'line',props:{color:'123456'}};d.rootIds.push('rule');
 const original=await documentFlow(d,fakeRuntime);expect(original.pages.length).toBeGreaterThan(1);
 d.nodes.table.props.borderStyle='none';const before=JSON.stringify(d),hidden=await documentFlow(d,fakeRuntime);
 expect(JSON.stringify(d)).toBe(before);expect(hidden.pages.flatMap(p=>p.borders??[]).some(b=>b.nodeId==='table')).toBe(false);
 expect(hidden.pages.flatMap(p=>p.borders??[]).filter(b=>b.nodeId==='rule')).toHaveLength(1);
 const removeTableBorders=(draw:any)=>({...draw,pages:draw.pages.map((p:any)=>({...p,borders:(p.borders??[]).filter((b:any)=>b.nodeId!=='table')}))});
 expect(removeTableBorders(hidden)).toEqual(removeTableBorders(original));
});
it('preserves none through model19 group expansion and both renderers',async()=>{
 const t=groupLabelTemplate();t.areaFormats.meeting.fragment.nodes.table.props.borderStyle='none';
 const v=take(api.validateTemplate(t)),d=take(api.composeDocument(v,take(api.prepareGeneration(v,groupLabelRequest(t)))));
 const table=Object.values(d.nodes).find(n=>n.type==='table')!;
 expect((table as any).props.borderStyle).toBe('none');expect((table as any).rowGroups.length).toBeGreaterThan(0);
 const draw=await documentFlow(d,fakeRuntime);expect(draw.pages.flatMap(p=>p.borders??[])).toHaveLength(0);
 const sink=staged();take(await take(await api.createDocxEngine(fonts())).generateDocxTo(d,noImages,sink.output));
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await z.file('word/document.xml')!.async('string');
 expect(xml).toContain('<w:vMerge w:val="restart"/>');expect(xml).toContain('<w:vMerge w:val="continue"/>');
 expect(xml).not.toContain('w:val="single"');
});
it.each([null,0,false,'solid','transparent',{}])('rejects invalid borderStyle %j at both semantic boundaries',style=>{
 const t=mergedTemplate(),d=composed(t);t.areaFormats.merged.fragment.nodes.table.props.borderStyle=style;
 expect(api.validateTemplate(t).ok).toBe(false);
 (Object.values(d.nodes).find(n=>n.type==='table') as any).props.borderStyle=style;
 expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
