import {it,expect} from 'vitest';
import {measurePageBand} from '../../src/layout/pageBands.js';
import {fillPageFields} from '../../src/layout/fillPageFields.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
const style:any={fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:12,unit:'pt'},lineHeightPt:20};
const node=():any=>({id:'a',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',textAlign:'center',pageFieldLayout:'compact'},children:[{id:'label',type:'text',text:'Page '},{id:'p',type:'system-page-field',field:'current',width:{value:24,unit:'pt'}},{id:'of',type:'text',text:' of '},{id:'t',type:'system-page-field',field:'total',width:{value:24,unit:'pt'}}]});
const band=(n=node()):any=>({baseTextStyleId:'body',rootIds:['a'],nodes:{a:n}});
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
async function draw(n=node(),width=200,current:number|null=100,visibility='show'){
 const m=await measurePageBand(band(n),{body:style},width,fakeRuntime,{});
 return {pages:[{commands:[],pageNumbering:{current,total:240,visibility}}],pageTexts:m.pageTexts.map(t=>({...t,pageIndex:0,sectionId:'s'}))} as any;
}
it('rejects final overflow and explicit multiline text without moving pagination',async()=>{
 await expect(fillPageFields(await draw(node(),30),fakeRuntime)).rejects.toThrow(/one reserved line/);
 const n=node();n.children[0].text='Page\n';await expect(fillPageFields(await draw(n),fakeRuntime)).rejects.toThrow(/one reserved line/);
 const narrow=node();narrow.children[1].width.value=1;await expect(fillPageFields(await draw(narrow),fakeRuntime)).rejects.toMatchObject({path:'children.p'});
});
it('hides number text and rejects current on excluded pages',async()=>{
 const d=await draw(node(),200,null,'hide');await fillPageFields(d,fakeRuntime);expect(d.pages[0].commands).toEqual([]);
 await expect(fillPageFields(await draw(node(),200,null),fakeRuntime)).rejects.toThrow(/excluded page/);
});
it('aligns to a column with ink overhang and retains links',async()=>{
 const n=node();delete n.props.pageFieldLayout;n.props.textAlign='right';n.children=[{id:'link',type:'link',text:'ABC',url:'https://example.com'}];
 const b=band(n);b.rootIds=['c'];b.nodes.c={id:'c',type:'columns',props:{gap:{value:10,unit:'pt'}},columns:[{weight:1,childIds:[]},{weight:1,childIds:['a']}]};
 const runtime={...fakeRuntime,async shape(t:string){const s=await fakeRuntime.shape(t);return {...s,inkLeftPt:-2,inkRightPt:20};}};
 const m=await measurePageBand(b,{body:style},210,runtime,{}),r=m.commands[0]!;
 expect(r.bounds.xPt).toBe(190);expect(r.links?.[0]?.link).toMatchObject({url:'https://example.com'});
});
it('round trips band options and keeps body geometry identical when numbers are hidden',async()=>{
 const t=ownedTemplate();t.nodeModelVersion=16;
 for(const s of t.sections){s.header.fragment={rootIds:['a'],nodes:{a:node()}};s.header.baseTextStyleId='body';}
 const make=()=>{const v=ok(validateTemplate(t));return ok(composeDocument(v,ok(prepareGeneration(v,ownedRequest(t)))));};
 const d=await documentFlow(make(),fakeRuntime);expect(d.pageTexts).toHaveLength(3);await fillPageFields(d,fakeRuntime);
 expect(d.pages.map(p=>p.commands.filter(r=>r.id.startsWith('system-page-text')).map(r=>r.text))).toEqual([['Page 1 of 3'],['Page 2 of 3'],['Page 3 of 3']]);
 t.sections[1].numbering={mode:'continue',visibility:'hide'};const hidden=await documentFlow(make(),fakeRuntime);await fillPageFields(hidden,fakeRuntime);
 expect(hidden.pages[1]!.commands.some(r=>r.id.startsWith('system-page-text'))).toBe(false);
 const body=(pages:any[])=>pages.map(p=>p.commands.filter((r:any)=>!r.id.startsWith('system-page')).map((r:any)=>r.bounds));expect(body(hidden.pages)).toEqual(body(d.pages));
});
it('rejects invalid options, ambiguous fixed alignment and use outside bands',()=>{
 for(const props of [{textAlign:'justify'},{pageFieldLayout:'auto'},{textAlign:'center',pageFieldLayout:undefined}]){
  const t=ownedTemplate();t.nodeModelVersion=16;const n=node();n.props={textStyleId:'body',...props};if(n.props.pageFieldLayout===undefined)delete n.props.pageFieldLayout;t.sections[0].header.fragment={rootIds:['a'],nodes:{a:n}};expect(validateTemplate(t).ok).toBe(false);
 }
 const t=ownedTemplate();t.nodeModelVersion=16;const n=node();delete n.props.pageFieldLayout;n.children=[{id:'label',type:'text',text:'text'}];const s=t.sections[0];s.source={kind:'authored',fragment:{rootIds:['a'],nodes:{a:n}}};expect(validateTemplate(t).ok).toBe(false);
});
