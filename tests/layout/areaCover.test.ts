import {it,expect} from 'vitest';
import {areaCover,composeArea} from '../helpers/areaCover.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {validateTemplate} from '../../src/index.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {areaTemplate} from '../helpers/areas.js';
import {readFileSync} from 'node:fs';
import {prepareGeneration,composeDocument} from '../../src/index.js';
function componentFixture(){return ['template','request'].map(n=>JSON.parse(readFileSync(`fixtures/area-cover/${n}.json`,'utf8'))) as [any,any];}
function composedFixture(t:any,r:any){const v=validateTemplate(t);expect(v.ok,JSON.stringify(v)).toBe(true);if(!v.ok)throw Error('template');const p=prepareGeneration(v.value,r);expect(p.ok,JSON.stringify(p)).toBe(true);if(!p.ok)throw Error('request');const d=composeDocument(v.value,p.value);expect(d.ok,JSON.stringify(d)).toBe(true);if(!d.ok)throw Error('compose');return d.value;}
it('accepts fixed Area roots in model19 and reserves equal space for empty and multiline text',async()=>{
 const ys=[];for(const text of ['one','one\ntwo','']){const d=composeArea(areaCover(text));expect(validateResolvedDocument(d)).toEqual([]);const draw=await documentFlow(d,fakeRuntime);ys.push(draw.pages[0]!.commands.find(c=>c.text==='AFTER')!.bounds.yPt);}
 expect(ys).toEqual([ys[0],ys[0],ys[0]]);expect(ys[0]).toBeCloseTo(20*72/25.4+120);
});
it('rejects own-frame and remaining-body overflow without shrinking or moving the frame',async()=>{
 await expect(documentFlow(composeArea(areaCover('one\ntwo',35.9)),fakeRuntime)).rejects.toBeDefined();
 const t=areaCover('one',400);Object.assign(t.areaFormats.panel.fragment.nodes.after.props,{heightMode:'fixed',height:{value:400,unit:'pt'}});
 await expect(documentFlow(composeArea(t),fakeRuntime)).rejects.toBeDefined();
 await expect(documentFlow(composeArea(areaCover('one\ntwo',36)),fakeRuntime)).resolves.toBeDefined();
});
it('allows direct model19 fixed roots while retaining model18 Area prohibition',()=>{
 const t=areaCover(),s=t.sections[0];s.source.fragment=t.areaFormats.panel.fragment;s.inputSchema={type:'object',fields:{}};t.areaFormats={};expect(validateTemplate(t).ok).toBe(true);
 const legacy=areaCover();legacy.nodeModelVersion=18;Object.assign(legacy.sections[0],{id:'main',key:'main',formats:{}});delete legacy.sections[0].label;delete legacy.sections[0].nameBase;expect(validateTemplate(legacy).ok).toBe(false);
});
it('keeps fixed frames forbidden inside cell Areas in model19',()=>{
 const t=areaTemplate();t.nodeModelVersion=19;t.sections.forEach((s:any,i:number)=>{delete s.key;delete s.formats;s.id=`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;s.label='Part'+i;s.nameBase='Part';});
 expect(validateTemplate(t).ok).toBe(true);Object.assign(t.areaFormats['format-001'].fragment.nodes.text.props,{heightMode:'fixed',height:{value:80,unit:'pt'}});expect(validateTemplate(t).ok).toBe(false);
});
it('assembles five native Areas in one Section without blank pages or lost Thai/image/table content',async()=>{
 const [t,r]=componentFixture(),d=composedFixture(t,r),draw=await documentFlow(d,fakeRuntime,{'22222222-2222-4222-8222-222222222222':{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])}} as any);
 expect(draw.pages).toHaveLength(6);expect(new Set(draw.pages.map(p=>p.sectionId)).size).toBe(1);
 const text=draw.pages.flatMap(p=>p.commands).map(c=>c.text).join('\n');for(const marker of ['COVER','APPROVAL','REVISIONS','INTRODUCTION','BODY 01','BODY 42','ผู้ตรวจสอบ'])expect(text).toContain(marker);
 expect(draw.pages[0]!.commands.some(c=>c.text.includes('HEADER')||c.text.includes('FOOTER'))).toBe(false);
 for(const page of draw.pages.slice(1)){expect(page.commands.some(c=>c.text.includes('HEADER'))).toBe(true);expect(page.commands.some(c=>c.text.includes('FOOTER'))).toBe(true);}
 expect(draw.pages[3]!.images).toHaveLength(1);expect(draw.pages[1]!.borders!.length).toBeGreaterThan(0);
 expect(draw.pages.map(p=>p.countedPageNumber)).toEqual([1,2,3,4,5,6]);
});
it.each(['all','first','continuation','none'])('uses Section %s band modes and the matching body capacity',async mode=>{
 const [t,r]=componentFixture();t.sections[0].headerMode=mode;t.sections[0].footerMode=mode;
 const draw=await documentFlow(composedFixture(t,r),fakeRuntime);
 draw.pages.forEach((p,i)=>{const enabled=mode==='all'||(mode==='first'&&i===0)||(mode==='continuation'&&i>0);expect(p.commands.some(c=>c.text.includes('HEADER'))).toBe(enabled);expect(p.commands.some(c=>c.text.includes('FOOTER'))).toBe(enabled);
 const body=p.commands.filter(c=>!c.text.includes('HEADER')&&!c.text.includes('FOOTER'));expect(body.every(c=>c.bounds.yPt>=20*72/25.4+(enabled?26:0)-1e-6)).toBe(true);});
});
it('rejects fixed frames that fit bare margins but collide with reserved Section bands',async()=>{
 const [t,r]=componentFixture();t.sections[0].headerMode='all';t.sections[0].footerMode='all';t.areaFormats['format-0'].fragment.nodes.heading.props.height.value=700;
 t.areaFormats['format-0'].fragment.rootIds=['heading'];delete t.areaFormats['format-0'].fragment.nodes.subtitle;delete t.areaFormats['format-0'].fragment.nodes.leading;delete t.areaFormats['format-0'].fragment.nodes.break;delete t.areaFormats['format-0'].fragment.nodes.again;
 await expect(documentFlow(composedFixture(t,r),fakeRuntime)).rejects.toBeDefined();
 t.sections[0].headerMode='none';t.sections[0].footerMode='none';await expect(documentFlow(composedFixture(t,r),fakeRuntime)).resolves.toBeDefined();
});
it('rejects Area page/band overrides and nested Area nodes',()=>{
 for(const extra of [{pageLayoutId:'portrait'},{header:{}},{footer:{}},{headerMode:'none'}]){const t=areaCover();Object.assign(t.areaFormats.panel,extra);expect(validateTemplate(t).ok).toBe(false);}
 const t=areaCover();t.areaFormats.panel.fragment.nodes.title={id:'title',type:'area',props:{areaId:'parts'}};expect(validateTemplate(t).ok).toBe(false);
});
