import {it,expect,vi} from 'vitest';
import * as api from '../../src/fonts/selection.js';
import {measureText} from '../../src/layout/measureText.js';
import {measureNumber} from '../../src/layout/fillContentsNumbers.js';
import {fakeRuntime,document} from '../helpers/document.js';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {readFileSync} from 'node:fs';
const release='20000000-0000-4000-8000-000000000001';
const style:any={font:{kind:'library',releaseId:release,weight:400,style:'normal'},fontSize:{value:12,unit:'pt'},lineHeightPt:20};
it('selects exact pinned release/face and keeps legacy Sarabun IDs',()=>{
 expect(api.selectFont).toBeTypeOf('function');
 const fonts:any[]=[{id:'first',selection:{releaseId:release,weight:400,style:'normal'}},{id:'second',selection:{releaseId:release,weight:700,style:'italic'}}];
 expect(api.selectFont(style,fonts).id).toBe('first');
 expect(()=>api.selectFont({...style,font:{...style.font,weight:700}},fonts)).toThrow();
 expect(()=>api.selectFont({...style,font:{kind:'unselected'}},fonts)).toThrow();
 expect(api.fontIdForStyle(document().styles.body!)).toBe('font-regular');
});
it('routes body and page/contents numbers through the runtime selection without losing cache identity',async()=>{
 const shape=vi.fn(fakeRuntime.shape),runtime={...fakeRuntime,shape,fontId:()=> 'release-and-hash-id'};
 await measureText(document('abc').nodes.t as any,style,300,runtime);
 await measureNumber('number','12',style,50,runtime);
 expect(shape.mock.calls.length).toBeGreaterThan(1);
 expect(shape.mock.calls.every((c:any[])=>c[1]==='release-and-hash-id')).toBe(true);
});
it('round trips schema 2 through validate, prepare and composition while preserving schema 1',()=>{
 const t=JSON.parse(readFileSync('fixtures/areas/template.json','utf8'));t.examples=[];
 const old=validateTemplate(t);expect(old.ok).toBe(true);const before=JSON.stringify(t);
 const next=structuredClone(t);next.schemaVersion=2;for(const key of Object.keys(next.styles))next.styles[key]=style;
 const v=validateTemplate(next);expect(v.ok,JSON.stringify(v)).toBe(true);
 if(v.ok){const request={docKey:next.docKey,data:{},sections:Object.fromEntries(['evidence','evidence2','merged'].map(k=>[k,{data:{details:[]}}]))};const input=prepareGeneration(v.value,request);expect(input.ok,JSON.stringify(input)).toBe(true);if(!input.ok)throw Error('prepare');expect(composeDocument(v.value,input.value)).toMatchObject({ok:true,value:{schemaVersion:2}});}
 expect(JSON.stringify(t)).toBe(before);expect(validateTemplate(t)).toEqual(old);
 const pending=structuredClone(next);for(const s of Object.values(pending.styles) as any[])s.font={kind:'unselected'};expect(validateTemplate(pending).ok).toBe(true);
 for(const font of [{kind:'library',releaseId:release,weight:'400',style:'normal'},{kind:'library',releaseId:release,weight:1001,style:'normal'},{kind:'library',releaseId:'/tmp/font.ttf',weight:400,style:'normal'},{kind:'unselected',releaseId:release}]){
  const invalid=structuredClone(next);invalid.styles[Object.keys(invalid.styles)[0]!].font=font;expect(validateTemplate(invalid).ok).toBe(false);
 }
 const mixed=structuredClone(next);mixed.styles[Object.keys(mixed.styles)[0]!].fontFamilyKey='sarabun';expect(validateTemplate(mixed).ok).toBe(false);
});
