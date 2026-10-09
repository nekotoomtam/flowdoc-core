import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration} from '../../src/index.js';
import {cellRepeatTemplate,cellRepeatRequest,photo} from '../helpers/cellRepeats.js';
const valid=(t:any)=>{const r=validateTemplate(t);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)throw Error('template');return r.value;};
it('accepts model10 range and array image input with empty one and many items',()=>{
 const t=valid(cellRepeatTemplate());for(const n of [0,1,3])expect(prepareGeneration(t,cellRepeatRequest(Array.from({length:n},()=>({photo,caption:'caption'})))).ok).toBe(true);
});
it.each([4,5,6,7,8,9])('rejects new contract on model %s',version=>{const t=cellRepeatTemplate();t.nodeModelVersion=version;expect(validateTemplate(t).ok).toBe(false);});
it.each([
 ['empty fields',(t:any)=>t.formats.merged.inputSchema.fields.evidenceList.items.fields={}],
 ['nested array',(t:any)=>t.formats.merged.inputSchema.fields.evidenceList.items.fields.x={type:'array',items:{type:'object',fields:{x:{type:'string'}}}}],
 ['object field',(t:any)=>t.formats.merged.inputSchema.fields.evidenceList.items.fields.x={type:'object',fields:{}}],
 ['empty range',(t:any)=>t.formats.merged.cellRepeats[0].childTemplateIds=[]],
 ['reversed',(t:any)=>t.formats.merged.cellRepeats[0].childTemplateIds=['caption','photo']],
 ['noncontiguous',(t:any)=>t.formats.merged.cellRepeats[0].childTemplateIds=['photo','footer']],
 ['duplicate child',(t:any)=>t.formats.merged.cellRepeats[0].childTemplateIds=['photo','photo']],
 ['wrong child',(t:any)=>t.formats.merged.cellRepeats[0].childTemplateIds=['bt']],
 ['missing cell',(t:any)=>t.formats.merged.cellRepeats[0].cellId='missing'],
 ['bad source',(t:any)=>t.formats.merged.cellRepeats[0].source.key='missing'],
 ['bad repeat ID',(t:any)=>t.formats.merged.cellRepeats[0].id='bad~id'],
 ['duplicate repeat',(t:any)=>t.formats.merged.cellRepeats.push(structuredClone(t.formats.merged.cellRepeats[0]))],
 ['static item ref',(t:any)=>t.formats.merged.fragment.nodes.at.children=[{id:'static-field',type:'field-ref',scope:'item',key:'caption'}]],
 ['header repeat',(t:any)=>{const f=t.formats.merged;f.fragment.nodes.h.childIds.push('photo','caption');f.fragment.nodes.a.childIds=['at','footer'];f.cellRepeats[0].cellId='h';}],
 ['row nesting',(t:any)=>{const f=t.formats.merged;f.fragment.nodes.a.props.rowSpan=1;f.repeats=[{tableId:'table',rowTemplateId:'r1',source:{scope:'local',key:'evidenceList'}}];}],
] as const)('rejects %s',(_,change)=>{const t=cellRepeatTemplate();change(t);expect(validateTemplate(t).ok).toBe(false);});
it('keeps item error paths and unknown warnings',()=>{
 const t=valid(cellRepeatTemplate());for(const item of [{caption:'missing'},{photo:12},{photo:null}]){
  const r=prepareGeneration(t,cellRepeatRequest([{photo},item]));expect(r.ok).toBe(false);if(!r.ok)expect(r.issues.some(i=>i.path==='content[0].data.evidenceList[1].photo')).toBe(true);
 }
 const r=prepareGeneration(t,cellRepeatRequest([{photo,extra:'ignored'}]));expect(r.ok).toBe(true);expect(r.warnings[0]?.path).toBe('content[0].data.evidenceList[0].extra');
});
it('uses optional defaults but required overrides default',()=>{
 const input=cellRepeatTemplate(),f=input.formats.merged.inputSchema.fields.evidenceList;f.default=[{photo,caption:'default'}];
 const req=cellRepeatRequest();delete (req.content[0]!.data as any).evidenceList;
 const r=prepareGeneration(valid(input),req);expect(r.ok&&r.value.content[0]?.data.evidenceList).toEqual(f.default);
 f.required=true;expect(prepareGeneration(valid(input),req).ok).toBe(false);
 f.default=[{photo:7}];expect(validateTemplate(input).ok).toBe(false);
});
it('accepts global array binding and rejects null arrays',()=>{
 const t=cellRepeatTemplate(),f=t.formats.merged;t.globalSchema.fields=f.inputSchema.fields;f.inputSchema.fields={};f.cellRepeats[0].source.scope='global';
 const r:any=cellRepeatRequest();r.data={evidenceList:[{photo}]};r.content[0].data={};expect(prepareGeneration(valid(t),r).ok).toBe(true);
 r.data.evidenceList=null;expect(prepareGeneration(valid(t),r).ok).toBe(false);
});

it('does not accept even empty cellRepeats in model9, preserves legacy empty item schema',()=>{
 const t=cellRepeatTemplate(),f=t.formats.merged;t.nodeModelVersion=9;f.cellRepeats=[];f.fragment.nodes.photo.props.source={scope:'local',key:'photo'};f.inputSchema.fields.photo={type:'image'};f.fragment.nodes.caption.children=[];f.inputSchema.fields.evidenceList.items.fields={};
 expect(validateTemplate(t).ok).toBe(false);delete f.cellRepeats;expect(validateTemplate(t).ok).toBe(true);
});
it('rejects a second repeat on the same cell even with a distinct repeat ID',()=>{const t=cellRepeatTemplate(),f=t.formats.merged;f.cellRepeats.push({...structuredClone(f.cellRepeats[0]),id:'different'});expect(validateTemplate(t).ok).toBe(false);});
