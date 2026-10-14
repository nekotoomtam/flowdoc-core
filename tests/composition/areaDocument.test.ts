import {it,expect,vi} from 'vitest';
import {ownedTemplate} from '../helpers/sectionOwnership.js';
import {fakeRuntime} from '../helpers/document.js';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {validatePreparedInput} from '../../src/composition/validatePreparedInput.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
function fixture(version=18):any {
 const t=ownedTemplate();t.nodeModelVersion=version;t.sections=t.sections.slice(0,1);
 const s=t.sections[0];s.inputSchema={type:'object',fields:{details:{type:'area',areaId:'details',required:true}}};
 s.source={kind:'authored',fragment:{rootIds:['place'],nodes:{place:{id:'place',type:'area',props:{areaId:'details'}}}},repeats:[]};
 t.areaFormats={text:{key:'text',ownerAreaId:'details',inputSchema:{type:'object',fields:{text:{type:'string',required:true}}},fragment:{rootIds:['text'],nodes:{text:{id:'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'value',type:'field-ref',scope:'local',key:'text'}]}}},repeats:[]}};return t;
}
const request=(entries:any[])=>({docKey:fixture().docKey,data:{projectName:'Shared'},sections:{one:{data:{details:entries}}}});
const entry=(text:string)=>({format:'text',data:{text}});
it('validates Areas without intermediate deep snapshots while keeping the public result detached',()=>{
 const v=ok(validateTemplate(fixture())),p=ok(prepareGeneration(v,request([entry('A'),entry('B')])));
 const clone=vi.spyOn(globalThis,'structuredClone');let result:any;
 try{result=ok(validatePreparedInput(v,p));expect(clone).toHaveBeenCalledTimes(2);}finally{clone.mockRestore();}
 expect(result).toEqual(p);result.sections['id-one'].data.details.entries[0].data.text='CHANGED';
 expect(p.sections['id-one'].data.details.entries[0].data.text).toBe('A');
});
it('composes a named section Area and rejects direct content on model18',()=>{
 const t=fixture(),v=ok(validateTemplate(t));const r:any=request([entry('A'),entry('B')]);
 const d=ok(composeDocument(v,ok(prepareGeneration(v,r))));expect(d.rootIds).toHaveLength(2);
 r.sections.one.content=[];expect(prepareGeneration(v,r).ok).toBe(false);
 t.sections[0].source={kind:'content'};expect(validateTemplate(t).ok).toBe(false);
});
it('fails invalid Area entries with indexed diagnostics while model17 keeps skip semantics',()=>{
 for(const e of [{format:'missing',data:{}},{format:'text',data:{}},{format:'text',data:{text:4}}]){
  const v=ok(validateTemplate(fixture()));const result=prepareGeneration(v,request([entry('A'),e]));
  expect(result.ok).toBe(false);if(!result.ok)expect(result.issues.some(i=>i.path.startsWith('sections.one.data.details[1]'))).toBe(true);
  const old=prepareGeneration(ok(validateTemplate(fixture(17))),request([entry('A'),e]));expect(old.ok).toBe(true);expect(old.warnings.some(w=>w.code==='AREA_ENTRY_SKIPPED')).toBe(true);
 }
});
it('author-defined breaks separate content without leading, repeated or trailing blank pages',async()=>{
 const t=fixture();t.areaFormats.break={key:'break',ownerAreaId:'details',inputSchema:{type:'object',fields:{}},fragment:{rootIds:['break'],nodes:{break:{id:'break',type:'page-break'}}},repeats:[]};
 const br={format:'break',data:{}},v=ok(validateTemplate(t));
 const d=ok(composeDocument(v,ok(prepareGeneration(v,request([br,br,entry('A'),br,br,entry('B'),br,br])))));
 const draw=await documentFlow(d,fakeRuntime);expect(draw.pages).toHaveLength(2);
 expect(draw.pages[0]!.commands.some(c=>c.text==='A')).toBe(true);expect(draw.pages[1]!.commands.some(c=>c.text==='B')).toBe(true);
 t.nodeModelVersion=17;expect(validateTemplate(t).ok).toBe(false);
});
it('does not allow breaks in header/footer graphs',()=>{
 const t=fixture();t.sections[0].header.fragment={rootIds:['break'],nodes:{break:{id:'break',type:'page-break'}}};expect(validateTemplate(t).ok).toBe(false);
});
it('does not turn a break followed by an empty contents list into a blank page',async()=>{
 const t=fixture();delete t.sections[0].header;
 const f=t.sections[0].source.fragment;
 f.rootIds.push('break','toc');f.nodes.break={id:'break',type:'page-break'};f.nodes.toc={id:'toc',type:'table-of-contents',props:{textStyleId:'body'}};
 const v=ok(validateTemplate(t)),d=ok(composeDocument(v,ok(prepareGeneration(v,request([entry('A')])))));
 const draw=await documentFlow(d,fakeRuntime);expect(draw.pages).toHaveLength(1);expect(draw.pages[0]!.commands.some(c=>c.text==='A')).toBe(true);
});
it('rejects a tampered prepared Area that silently drops an entry',()=>{
 const v=ok(validateTemplate(fixture()));const p=ok(prepareGeneration(v,request([entry('A'),entry('B')])));
 const area=p.sections['id-one'].data.details;area.entries.pop();area.skippedIndices=[1];
 expect(composeDocument(v,p).ok).toBe(false);
});
it('rejects legacy skipped-entry metadata relabelled as model18 prepared input',()=>{
 const old=ok(validateTemplate(fixture(17))),v=ok(validateTemplate(fixture()));
 const p=ok(prepareGeneration(old,request([entry('A'),{format:'missing',data:{}}])));
 p.template.fingerprint=v.fingerprint;expect(composeDocument(v,p).ok).toBe(false);
});
it('keeps empty optional Areas empty and rejects cross-Area formats',()=>{
 const t=fixture();t.sections[0].inputSchema.fields.details.required=false;
 const v=ok(validateTemplate(t));expect(prepareGeneration(v,request([])).ok).toBe(true);
 const r:any=request([]);delete r.sections.one.data.details;expect(prepareGeneration(v,r).ok).toBe(true);
 expect(prepareGeneration(v,request([{format:'outside',data:{}}])).ok).toBe(false);
});
it('does not materialize a section consisting only of page breaks',async()=>{
 const t=fixture();t.areaFormats.break={key:'break',ownerAreaId:'details',inputSchema:{type:'object',fields:{}},fragment:{rootIds:['break'],nodes:{break:{id:'break',type:'page-break'}}},repeats:[]};
 const v=ok(validateTemplate(t));const result=composeDocument(v,ok(prepareGeneration(v,request([{format:'break',data:{}}]))));
 expect(result.ok).toBe(false);if(!result.ok)expect(result.issues[0].code).toBe('EMPTY_CONTENT');
});
