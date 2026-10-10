import {it,expect} from 'vitest';
import {coverTemplate} from '../helpers/cover.js';
import {composed} from '../helpers/sections.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
function fixture(text:string,align='top',height=72){const t=coverTemplate(),f=t.sections[0].source.fragment;f.nodes.title.children=text?[{id:'txt',type:'text',text}]:[];Object.assign(f.nodes.title.props,{height:{value:height,unit:'pt'},verticalAlign:align});f.nodes.after={id:'after',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'aftertext',type:'text',text:'AFTER'}]};f.rootIds.push('after');return t;}
it('reserves equal space for short long and empty text',async()=>{const ys=[];for(const text of ['one','one\ntwo','']){const draw=await documentFlow(composed(fixture(text)),fakeRuntime);ys.push(draw.pages[0]!.commands.find(c=>c.text==='AFTER')!.bounds.yPt);}expect(ys[0]).toBeCloseTo(20*72/25.4+72);expect(ys).toEqual([ys[0],ys[0],ys[0]]);});
it.each([['top',0],['center',24],['bottom',48]])('aligns %s within fixed frame',async(align,offset)=>{const t=fixture('one',align as string);t.styles.body.lineHeightPt=24;const draw=await documentFlow(composed(t),fakeRuntime);expect(draw.pages[0]!.commands[0]!.bounds.yPt).toBeCloseTo(20*72/25.4+Number(offset));});
it('rejects text larger than its frame but permits a truly empty small frame',async()=>{await expect(documentFlow(composed(fixture('one','top',1)),fakeRuntime)).rejects.toMatchObject({nodeId:'section-intro~title'});await expect(documentFlow(composed(fixture('','top',1)),fakeRuntime)).resolves.toBeDefined();await expect(documentFlow(composed(fixture('\n','top',1)),fakeRuntime)).rejects.toBeDefined();});
it('rejects total cover overflow although each frame individually fits',async()=>{const t=fixture('one','top',400);Object.assign(t.sections[0].source.fragment.nodes.after.props,{heightMode:'fixed',height:{value:400,unit:'pt'}});await expect(documentFlow(composed(t),fakeRuntime)).rejects.toMatchObject({nodeId:'section-intro~after'});});
it('creates exactly explicit empty cover and consecutive blanks and skips empty body',async()=>{const t=coverTemplate();t.sections[0].source.fragment={rootIds:[],nodes:{}};t.sections.splice(1,0,{id:'b1',source:{kind:'blank'}},{id:'b2',source:{kind:'blank'}});const draw=await documentFlow(composed(t,[]),fakeRuntime);expect(draw.pages.map(p=>p.sectionId)).toEqual(['intro','b1','b2']);expect(draw.pages.every(p=>p.commands.length===0)).toBe(true);});
it('rejects image and table continuation within a cover',async()=>{
 for(const type of ['image','table']){
  const t=fixture('one','top',700),f=t.sections[0].source.fragment;f.rootIds=['title'];delete f.nodes.after;
  if(type==='image'){t.globalSchema.fields.photo={type:'image',default:'11111111-1111-4111-8111-111111111111'};f.rootIds.push('photo');f.nodes.photo={id:'photo',type:'image',props:{width:{value:20,unit:'mm'},height:{value:30,unit:'mm'},source:{scope:'global',key:'photo'}}};}
  else {f.rootIds.push('table');Object.assign(f.nodes,{table:{id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:50,unit:'mm'}}],rowIds:['row']},row:{id:'row',type:'table-row',props:{allowBreak:true},cellIds:['cell']},cell:{id:'cell',type:'table-cell',props:{},childIds:['celltext']},celltext:{id:'celltext',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'cellleaf',type:'text',text:'first\nsecond\nthird'}]}});}
  await expect(documentFlow(composed(t),fakeRuntime)).rejects.toMatchObject({nodeId:'section-intro~'+(type==='image'?'photo':'table')});
 }
});

it('accepts the exact fixed boundary and rejects the next line without changing content mode',async()=>{
 const t=fixture('one\ntwo','top',36);t.styles.body.lineHeightPt=18;
 const d=composed(t),draw=await documentFlow(d,fakeRuntime);expect(draw.pages[0]!.commands.find(c=>c.text==='AFTER')!.bounds.yPt).toBeCloseTo(20*72/25.4+36);
 t.sections[0].source.fragment.nodes.title.props.height.value=35.9;await expect(documentFlow(composed(t),fakeRuntime)).rejects.toBeDefined();
 const ys=[];for(const text of ['one','one\ntwo']){const c=fixture(text),p=c.sections[0].source.fragment.nodes.title.props;delete p.height;delete p.verticalAlign;p.heightMode='content';ys.push((await documentFlow(composed(c),fakeRuntime)).pages[0]!.commands.find(c=>c.text==='AFTER')!.bounds.yPt);}expect(ys[1]!-ys[0]!).toBe(18);
});
it('uses equal frame space in mm and pt and keeps intentional first and last blank pages',async()=>{
 const positions=[];for(const height of [{value:25.4,unit:'mm'},{value:72,unit:'pt'}]){const t=fixture('one');t.sections[0].source.fragment.nodes.title.props.height=height;positions.push((await documentFlow(composed(t),fakeRuntime)).pages[0]!.commands.find(c=>c.text==='AFTER')!.bounds.yPt);}expect(positions[0]).toBeCloseTo(positions[1]!);
 const t=coverTemplate();t.sections=[{id:'first',source:{kind:'blank'}},t.sections[1],{id:'last',source:{kind:'blank'}}];const draw=await documentFlow(composed(t,[]),fakeRuntime);expect(draw.pages.map(p=>p.sectionId)).toEqual(['first','last']);expect(draw.pages.map(p=>p.countedPageNumber)).toEqual([1,2]);
});
