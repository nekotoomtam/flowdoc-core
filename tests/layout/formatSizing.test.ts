import {it,expect} from 'vitest';
import {sizingTemplate,composeSizing,sizingEntry,setSizingBodyHeight} from '../helpers/formatSizing.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
const fixed=(value:number)=>({mode:'fixed',height:{value,unit:'pt'}});
const texts=(draw:any)=>draw.pages.flatMap((p:any)=>p.commands.map((r:any)=>r.text));
it('stops each fixed instance independently and keeps the next call',async()=>{
 const d=composeSizing(sizingTemplate(fixed(100)),[sizingEntry(Array.from({length:10},(_,i)=>'A'+i).join('\n')),sizingEntry('B')]),before=structuredClone(d);
 const draw=await documentFlow(d,fakeRuntime);expect(texts(draw)).toEqual(['A0','A1','A2','A3','A4','B']);
 expect(draw.warnings).toHaveLength(1);expect(draw.warnings![0]).toMatchObject({code:'FORMAT_CONTENT_OMITTED',formatOmission:{areaEntryIndex:0,reason:'height-limit',pending:[{kind:'text',lineIndex:5}]}});
 const b=draw.pages[0]!.commands.find(c=>c.text==='B')!;expect(b.bounds.yPt).toBeCloseTo(20*72/25.4+100);expect(d).toEqual(before);
});
it('reserves empty calls, but does not reserve absent calls',async()=>{
 const t=sizingTemplate(fixed(100));const r=await documentFlow(composeSizing(t,[sizingEntry(''),sizingEntry('B')]),fakeRuntime);
 expect(r.pages[0]!.commands.find(c=>c.text==='B')!.bounds.yPt).toBeCloseTo(20*72/25.4+100);expect(r.warnings??[]).toEqual([]);
});
it('caps a maximum larger than a page and gives the next fixed call a zero-space warning',async()=>{
 const t=sizingTemplate(fixed(1000));t.areaFormats.small=structuredClone(t.areaFormats.panel);t.areaFormats.small.key='small';t.areaFormats.small.sizing=fixed(60);
 const r=await documentFlow(composeSizing(t,[sizingEntry('FIRST'),{format:'small',data:{text:'HIDDEN'}}]),fakeRuntime);
 expect(r.pages).toHaveLength(1);expect(texts(r)).toEqual(['FIRST']);expect(r.pages[0]!.commands[0]!.bounds.yPt).toBeCloseTo(20*72/25.4);
 expect(r.warnings).toHaveLength(1);expect(r.warnings![0]).toMatchObject({code:'FORMAT_FRAME_NOT_SHOWN',formatFrameOmission:{areaEntryIndex:1,requiredHeightPt:60,availableHeightPt:0}});
});
it.each([120,119.99999])('uses the remaining %spt for the third fixed300 call without moving it',async height=>{
 const t=sizingTemplate(fixed(300));setSizingBodyHeight(t,600+height);
 const entries=[sizingEntry('FIRST'),sizingEntry('SECOND'),sizingEntry(Array.from({length:10},(_,i)=>'L'+i).join('\n'))],before=structuredClone({t,entries});
 const d=composeSizing(t,entries),r=await documentFlow(d,fakeRuntime),count=height===120?6:5;
 expect(r.pages).toHaveLength(1);expect(texts(r)).toEqual(['FIRST','SECOND',...Array.from({length:count},(_,i)=>'L'+i)]);
 expect(r.pages[0]!.commands.find(c=>c.text==='SECOND')!.bounds.yPt).toBeCloseTo(20*72/25.4+300);
 expect(r.pages[0]!.commands.find(c=>c.text==='L0')!.bounds.yPt).toBeCloseTo(20*72/25.4+600);
 expect(r.warnings).toHaveLength(1);expect(r.warnings![0]).toMatchObject({code:'FORMAT_CONTENT_OMITTED',formatOmission:{areaEntryIndex:2,pending:[{lineIndex:count}]}});expect({t,entries}).toEqual(before);
});
it('reserves the full reduced frame after a partial call, then processes fixed and auto independently',async()=>{
 const t=sizingTemplate(fixed(180));setSizingBodyHeight(t,100);t.areaFormats.next={...structuredClone(t.areaFormats.panel),key:'next',sizing:fixed(60)};t.areaFormats.flow={...structuredClone(t.areaFormats.panel),key:'flow',sizing:{mode:'auto'}};
 const r=await documentFlow(composeSizing(t,[sizingEntry('A\nB\nC\nD\nE\nF'),{format:'next',data:{text:'HIDDEN'}},{format:'flow',data:{text:'NEXT PAGE'}}]),fakeRuntime);
 expect(r.pages).toHaveLength(2);expect(texts(r)).toEqual(['A','B','C','D','E','NEXT PAGE']);expect(r.pages[1]!.commands[0]!.bounds.yPt).toBeCloseTo(20*72/25.4);
 expect(r.warnings).toMatchObject([{code:'FORMAT_CONTENT_OMITTED',formatOmission:{areaEntryIndex:0,pending:[{lineIndex:5}]}},{code:'FORMAT_FRAME_NOT_SHOWN',formatFrameOmission:{areaEntryIndex:1,availableHeightPt:0}}]);
});
it.each(['','SHORT'])('reserves the reduced frame for %j content, unlike an absent invocation',async text=>{
 const t=sizingTemplate(fixed(300));setSizingBodyHeight(t,120);t.areaFormats.flow={...structuredClone(t.areaFormats.panel),key:'flow',sizing:{mode:'auto'}};const next={format:'flow',data:{text:'NEXT'}};
 const r=await documentFlow(composeSizing(t,[sizingEntry(text),next]),fakeRuntime);expect(r.pages).toHaveLength(2);expect(r.pages[1]!.commands[0]!.text).toBe('NEXT');expect(r.warnings??[]).toEqual([]);
 const absent=await documentFlow(composeSizing(t,[next]),fakeRuntime);expect(absent.pages).toHaveLength(1);expect(absent.pages[0]!.commands[0]!.bounds.yPt).toBeCloseTo(20*72/25.4);
});
it('distinguishes a positive frame with no fitting first line from zero space',async()=>{
 const t=sizingTemplate(fixed(300));setSizingBodyHeight(t,10);
 const r=await documentFlow(composeSizing(t,[sizingEntry('TOO TALL'),sizingEntry('NEXT')]),fakeRuntime);expect(r.pages).toHaveLength(1);expect(texts(r)).toEqual([]);
 expect(r.warnings).toMatchObject([{code:'FORMAT_CONTENT_OMITTED',formatOmission:{areaEntryIndex:0,pending:[{kind:'text',lineIndex:0}]}},{code:'FORMAT_FRAME_NOT_SHOWN',formatFrameOmission:{areaEntryIndex:1,availableHeightPt:0}}]);
});
it('deducts selected header and footer heights and gaps before capping fixed300',async()=>{
 const t=sizingTemplate(fixed(300));setSizingBodyHeight(t,168);const s=t.sections[0];
 for(const kind of ['header','footer']){s[kind+'Mode']='all';s[kind]={baseTextStyleId:'body',inputSchema:{type:'object',fields:{}},gap:{value:4,unit:'pt'},fragment:{rootIds:['band'],nodes:{band:{id:'band',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'value',type:'text',text:kind.toUpperCase()}]}}}};}
 const r=await documentFlow(composeSizing(t,[sizingEntry('L0\nL1\nL2\nL3\nL4\nL5\nL6')]),fakeRuntime);expect(r.pages).toHaveLength(1);expect(texts(r)).toEqual(['HEADER','FOOTER','L0','L1','L2','L3','L4','L5']);
 expect(r.pages[0]!.commands.find(c=>c.text==='L0')!.bounds.yPt).toBeCloseTo(20*72/25.4+24);expect(r.warnings![0]).toMatchObject({formatOmission:{pending:[{lineIndex:6}]}});
});
it('keeps ordinary explicit auto flowing with all content',async()=>{
 const lines=Array.from({length:90},(_,i)=>'L'+i);const r=await documentFlow(composeSizing(sizingTemplate({mode:'auto'}),[sizingEntry(lines.join('\n'))]),fakeRuntime);
 expect(r.pages.length).toBeGreaterThan(1);expect(texts(r)).toEqual(lines);expect(r.warnings??[]).toEqual([]);
});
it('treats an explicit break as fixed stop, not a page instruction for later entries',async()=>{
 const t=sizingTemplate(fixed(100));t.areaFormats.panel.fragment.nodes.br={id:'br',type:'page-break'};t.areaFormats.panel.fragment.rootIds.push('br','text2');t.areaFormats.panel.fragment.nodes.text2={...structuredClone(t.areaFormats.panel.fragment.nodes.text),id:'text2',children:[{id:'second',type:'text',text:'HIDDEN'}]};
 t.areaFormats.small={...structuredClone(t.areaFormats.panel),key:'small',fragment:{rootIds:['text'],nodes:{text:t.areaFormats.panel.fragment.nodes.text}},sizing:fixed(40)};
 const r=await documentFlow(composeSizing(t,[sizingEntry('A'),{format:'small',data:{text:'B'}}]),fakeRuntime);expect(r.pages).toHaveLength(1);expect(texts(r)).toEqual(['A','B']);expect(r.warnings![0]).toMatchObject({formatOmission:{reason:'explicit-page-break'}});
});
it('stops before a fixed image, without showing the tail, but processes the next instance',async()=>{
 const t=sizingTemplate(fixed(30));t.areaFormats.panel.inputSchema.fields.photo={type:'image',required:true};
 t.areaFormats.panel.fragment.nodes.pic={id:'pic',type:'image',props:{width:{value:20,unit:'pt'},height:{value:20,unit:'pt'},source:{scope:'local',key:'photo'}}};t.areaFormats.panel.fragment.rootIds.push('pic');
 const e=(text:string)=>({format:'panel',data:{text,photo:'22222222-2222-4222-8222-222222222222'}});const r=await documentFlow(composeSizing(t,[e('A'),e('B')]),fakeRuntime);
 expect(texts(r)).toEqual(['A','B']);expect(r.pages.flatMap(p=>p.images??[])).toEqual([]);expect(r.warnings).toHaveLength(2);expect(r.warnings![0]).toMatchObject({formatOmission:{reason:'image-does-not-fit'}});
});
it('omits only oversized images for explicit auto while preserving legacy failures',async()=>{
 const t=sizingTemplate({mode:'auto'});t.areaFormats.panel.inputSchema.fields.photo={type:'image',required:true};
 t.areaFormats.panel.fragment.nodes.pic={id:'pic',type:'image',props:{width:{value:20,unit:'pt'},height:{value:1000,unit:'pt'},source:{scope:'local',key:'photo'}}};t.areaFormats.panel.fragment.rootIds.unshift('pic');
 const entries=[{format:'panel',data:{text:'AFTER',photo:'22222222-2222-4222-8222-222222222222'}}];const r=await documentFlow(composeSizing(t,entries),fakeRuntime);
 expect(r.pages).toHaveLength(1);expect(texts(r)).toEqual(['AFTER']);expect(r.warnings![0]).toMatchObject({code:'FORMAT_IMAGE_NOT_SHOWN',formatImageOmission:{areaEntryIndex:0}});
 delete t.areaFormats.panel.sizing;await expect(documentFlow(composeSizing(t,entries),fakeRuntime)).rejects.toThrow();
});
it('does not index an omitted anchor, and errors explicitly for a surviving reference',async()=>{
 const t=sizingTemplate(fixed(20));t.areaFormats.panel.fragment.nodes.hidden={id:'hidden',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:'secret'},children:[{id:'hiddenText',type:'text',text:'HIDDEN'}]};t.areaFormats.panel.fragment.rootIds.push('hidden');
 let d=composeSizing(t,[sizingEntry('A')]),draw=await documentFlow(d,fakeRuntime);expect(Object.keys(indexDestinations(d,draw))).toEqual([]);
 t.areaFormats.ref={key:'ref',ownerAreaId:'parts',sizing:{mode:'auto'},inputSchema:{type:'object',fields:{}},repeats:[],fragment:{rootIds:['ref'],nodes:{ref:{id:'ref',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'link',type:'reference',text:'Jump',target:'secret'}]}}}};
 d=composeSizing(t,[sizingEntry('A'),{format:'ref',data:{}}]);draw=await documentFlow(d,fakeRuntime);
 expect(()=>resolveLinkGeometry(d,draw)).toThrow(expect.objectContaining({reason:'omitted-destination'}));
});
