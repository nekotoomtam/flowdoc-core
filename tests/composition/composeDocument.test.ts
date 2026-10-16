import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
const fixture=()=>JSON.parse(readFileSync('fixtures/srs-basic/template.json','utf8'));
function setup(change?:(t:any,q:any)=>void){const t=fixture(),q=structuredClone(t.examples[0].request);t.examples=[];change?.(t,q);const v=validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));const p=prepareGeneration(v.value,q);if(!p.ok)throw Error(JSON.stringify(p));return {v:v.value,p:p.value,q};}
it('composes independent A/B/A graphs, exact text and complete source mapping',()=>{
 const {v,p}=setup(),before=JSON.stringify(p),r=composeDocument(v,p);expect(r.ok).toBe(true);if(!r.ok)return;const d=r.value;
 expect(d.rootIds).toEqual(['section-main~area-main-details~entry-0~format-section-note~note','section-main~area-main-details~entry-1~format-requirement-list~table','section-main~area-main-details~entry-2~format-section-note~note']);
 const first=d.nodes[d.rootIds[0]!]!;expect(first.type==='text-block'&&first.children.map(c=>c.type==='text'?c.text:'\n').join('')).toBe('โครงการ ระบบจัดการเอกสาร: ขอบเขตการทำงาน');
 const table=d.nodes['section-main~area-main-details~entry-1~format-requirement-list~table'];expect(table?.type==='table'&&table.rowIds).toEqual(['section-main~area-main-details~entry-1~format-requirement-list~header','section-main~area-main-details~entry-1~format-requirement-list~row~item-0']);
 expect(d.nodes['section-main~area-main-details~entry-1~format-requirement-list~row']).toBeUndefined();
 const all=Object.values(d.nodes).flatMap(n=>[n.id,...n.type==='text-block'?n.children.map(c=>c.id):[]]);
 expect(new Set(all).size).toBe(all.length);expect(Object.keys(d.sourceMap).sort()).toEqual(all.sort());
 expect(d.sourceMap['section-main~area-main-details~entry-1~format-requirement-list~remark~item-0~part-0']).toEqual({origin:'authored',sectionId:'main',sourceId:'remark',itemIndex:0,areaId:'main-details',areaEntryIndex:1,areaFormatId:'requirement-list'});
 expect(JSON.stringify(p)).toBe(before);expect(d.nodes[d.rootIds[0]!]).not.toBe(d.nodes[d.rootIds[2]!]);
 expect(validateResolvedDocument(d)).toEqual([]);
});
it.each([0,1,4])('expands %i rows including multiple text children',count=>{
 const {v,p}=setup((t,q)=>{q.sections.main.data.details=[q.sections.main.data.details[1]];q.sections.main.data.details[0].data.items=Array.from({length:count},(_,i)=>({code:String(i),detail:'item'}));const f=t.areaFormats['requirement-list'];f.fragment.nodes.rc.childIds.push('extra');f.fragment.nodes.extra={...structuredClone(f.fragment.nodes.rtc),id:'extra',children:[{id:'extra-inline',type:'field-ref',scope:'item',key:'code'}]};});
 const r=composeDocument(v,p);expect(r.ok).toBe(true);if(!r.ok)return;const table=r.value.nodes['section-main~area-main-details~entry-0~format-requirement-list~table'];expect(table?.type==='table'&&table.rowIds.length).toBe(count+1);
 expect(Object.keys(r.value.nodes).filter(k=>k.startsWith('section-main~area-main-details~entry-0~format-requirement-list~extra')).length).toBe(count);
});
it('keeps global/local/item scopes separate within Area entries',()=>{
 const {v,p}=setup((t,q)=>{t.globalSchema.fields.code={type:'string'};q.data.code='global';const f=t.areaFormats['requirement-list'];f.inputSchema.fields.code={type:'string'};q.sections.main.data.details[1].data.code='local';f.fragment.nodes.rtc.children=[...['global','local','item'].map(scope=>({id:scope,type:'field-ref',scope,key:'code'}))];});
 const r=composeDocument(v,JSON.parse(JSON.stringify(p)));expect(r.ok).toBe(true);if(!r.ok)return;
 const n=r.value.nodes['section-main~area-main-details~entry-1~format-requirement-list~rtc~item-0'];expect(n?.type==='text-block'&&n.children.map(c=>c.type==='text'?c.text:'')).toEqual(['global','local','REQ-001']);expect(r.warnings).toEqual([]);
});
it('normalizes newlines, drops empty tags, preserves whitespace and order',()=>{
 const {v,p}=setup((t,q)=>{q.sections.main.data.details=[q.sections.main.data.details[2],q.sections.main.data.details[0]];q.sections.main.data.details[0].data.text=' a\r\nb\rc ';q.sections.main.data.details[1].data.text='';});const r=composeDocument(v,p);expect(r.ok).toBe(true);if(!r.ok)return;
 const n=r.value.nodes['section-main~area-main-details~entry-0~format-section-note~note'];expect(n?.type==='text-block'&&n.children.slice(-5).map(c=>c.type==='text'?c.text:'\n')).toEqual([' a','\n','b','\n','c ']);
 const last=r.value.nodes['section-main~area-main-details~entry-1~format-requirement-list~note'];expect(last?.type==='text-block'&&last.children.some(c=>c.id.includes('note-value'))).toBe(false);expect(validateResolvedDocument(r.value)).toEqual([]);
});
it('allows canonical optional empty values after persistence and does not alias results',()=>{
 const {v,p}=setup((t,q)=>{t.areaFormats['section-note'].inputSchema.fields.text={type:'string',allowEmpty:false};delete q.sections.main.data.details[0].data.text;});
 const r=composeDocument(v,JSON.parse(JSON.stringify(p)));expect(r.ok).toBe(true);if(!r.ok)return;r.value.styles.body!.lineHeightPt=99;expect(v.definition.styles.body!.lineHeightPt).toBe(18);
});
it.each([
 ['fingerprint',(p:any)=>p.template.fingerprint='wrong'],['pin',(p:any)=>p.template.version=2],
 ['missing normalized key',(p:any)=>delete p.data.projectName],['wrong type',(p:any)=>p.sections.main.data.details.entries[0].data.text=5],
 ['duplicate index',(p:any)=>p.sections.main.data.details.entries[1].originalIndex=0],['out of order',(p:any)=>p.sections.main.data.details.entries.reverse()],
 ['skipped overlap',(p:any)=>p.sections.main.data.details.skippedIndices=[0]],['missing coverage',(p:any)=>p.sections.main.data.details.originalCount=4],
 ['unknown normalized key',(p:any)=>p.data.extra='bad'],['bad warnings',(p:any)=>p.warnings=[{code:'fake'}]],
 ['missing default',(p:any)=>delete p.sections.main.data.details.entries[1].data.items[0].remark],
])('rejects malformed prepared snapshot: %s',(_label,mutate)=>{const {v,p}=setup();mutate(p);const r=composeDocument(v,p);expect(r.ok).toBe(false);if(!r.ok)expect(r.issues.every(i=>i.code==='INVALID_DATA')).toBe(true);});
