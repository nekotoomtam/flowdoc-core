import {it,expect} from 'vitest';
import {measurePageBand} from '../../src/layout/pageBands.js';
import {fakeRuntime} from '../helpers/document.js';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fillPageFields} from '../../src/layout/fillPageFields.js';
import {appendPageNumbers} from '../../src/layout/pageNumbers.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';
const styles:any={body:{fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:12,unit:'pt'},lineHeightPt:20}};
const band=():any=>({baseTextStyleId:'body',rootIds:['a'],nodes:{a:{id:'a',type:'text-block',props:{textStyleId:'body'},children:[{id:'label',type:'text',text:'Page '},{id:'p',type:'system-page-field',field:'current',width:{value:24,unit:'pt'}},{id:'of',type:'text',text:' / '},{id:'t',type:'system-page-field',field:'total',width:{value:24,unit:'pt'}}]}}});
it('reserves two atomic number slots beside static text',async()=>{const m:any=await measurePageBand(band(),styles,200,fakeRuntime,{});expect(m.pageFields).toHaveLength(2);expect(m.heightPt).toBe(20);expect(m.commands.map((r:any)=>r.text).join('')).toBe('Page  / ');});
it('fails a slot wider than the available band',async()=>{await expect(measurePageBand(band(),styles,20,fakeRuntime,{})).rejects.toThrow();});
it('reserves right ink overhang before the next slot',async()=>{const b=band();b.nodes.a.children=[{id:'ink',type:'text',text:'A'},{id:'p',type:'system-page-field',field:'current',width:{value:5,unit:'pt'}}];const runtime={...fakeRuntime,async shape(text:string){return {...await fakeRuntime.shape(text),inkLeftPt:0,inkRightPt:12};}};const m=await measurePageBand(b,styles,100,runtime,{});expect(m.pageFields[0]!.xPt).toBe(12);});
it('preserves Thai link text, explicit lines and wraps atomic slots',async()=>{const b=band();b.nodes.a.children=[{id:'link',type:'link',text:'ทดสอบไทย',url:'https://example.com'},{id:'p',type:'system-page-field',field:'current',width:{value:24,unit:'pt'}},{id:'br',type:'line-break'},{id:'tail',type:'text',text:'ท้าย'}];const m=await measurePageBand(b,styles,40,fakeRuntime,{});expect(m.pageFields[0]).toMatchObject({xPt:0,yPt:20});expect(m.commands.map(r=>r.text).join('')).toBe('ทดสอบไทยท้าย');expect(m.commands[0]!.links?.[0]?.link).toMatchObject({url:'https://example.com'});expect(m.commands.at(-1)!.bounds.yPt).toBe(40);});
it('fills separate page values without changing geometry and hides whole number blocks',async()=>{
 const t=ownedTemplate();t.nodeModelVersion=16;for(const s of t.sections){s.header.fragment={rootIds:['a','other'],nodes:{...band().nodes,other:{...band().nodes.a,id:'other',role:{role:'paragraph'},children:[{id:'other-text',type:'text',text:'ALWAYS'}]}}};s.header.fragment.nodes.a.role={role:'paragraph'};}
 const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
 const make=()=>{const v=ok(validateTemplate(t));return ok(composeDocument(v,ok(prepareGeneration(v,ownedRequest(t)))));};
 const d=make(),draw=await documentFlow(d,fakeRuntime),geometry=draw.pages.map(p=>p.commands.filter(r=>r.nodeId.includes('title')).map(r=>r.bounds));
 await fillPageFields(draw,fakeRuntime);expect(draw.pages.map(p=>p.commands.filter(r=>r.id.startsWith('system-page-')).map(r=>r.text))).toEqual([['1','3'],['2','3'],['3','3']]);
 const count=draw.pages[0].commands.length;await appendPageNumbers(d,draw,fakeRuntime);expect(draw.pages[0].commands).toHaveLength(count);
 t.sections[1].numbering={mode:'continue',visibility:'hide'};const hidden=await documentFlow(make(),fakeRuntime);await fillPageFields(hidden,fakeRuntime);expect(hidden.pages[1].commands.map(r=>r.text)).toContain('ALWAYS');expect(hidden.pages[1].commands.map(r=>r.text)).not.toContain('Page ');expect(hidden.pages[1].commands.some(r=>r.id.startsWith('system-page-'))).toBe(false);expect(hidden.pages.map(p=>p.commands.filter(r=>r.nodeId.includes('title')).map(r=>r.bounds))).toEqual(geometry);
});
it('fills 9/10 and 99/100 independently and reports actual ink overflow',async()=>{const draw:any={pages:[9,10,99,100].map(current=>({commands:[],pageNumbering:{current,total:4,visibility:'show'}})),pageFieldSlots:[9,10,99,100].map((_,pageIndex)=>({pageIndex,sectionId:'s',nodeId:'a',fieldId:'n',field:'current',widthPt:50,xPt:0,yPt:0,style:styles.body}))};await fillPageFields(draw,fakeRuntime);expect(draw.pages.map((p:any)=>p.commands[0].text)).toEqual(['9','10','99','100']);draw.pageFieldSlots=[{pageIndex:3,sectionId:'s',nodeId:'a',fieldId:'n',field:'current',widthPt:1,xPt:0,yPt:0,style:styles.body}];await expect(fillPageFields(draw,fakeRuntime)).rejects.toThrow(/fit/);});
it('keeps repeated TOC numbers tied to distinct anchors and rejects excluded targets',async()=>{const make=():any=>({pages:[{commands:[]},{commands:[],countedPageNumber:1,pageNumbering:{current:1,total:2,visibility:'hide'}},{commands:[],countedPageNumber:1,pageNumbering:{current:1,total:2,visibility:'show'}}],contentsSlots:['a','b'].map(anchorId=>({nodeId:'toc',anchorId,pageIndex:0,xPt:0,yPt:0,widthPt:40,style:styles.body}))});const anchors={a:{pageIndex:1,xPt:0,yPt:0},b:{pageIndex:2,xPt:0,yPt:0}},d=make();await fillContentsNumbers(d,anchors,fakeRuntime,true);expect(d.pages[0].commands.map((r:any)=>[r.text,r.links[0].link.target])).toEqual([['1','a'],['1','b']]);const excluded=make();excluded.pages[2].pageNumbering.current=null;excluded.pages[2].countedPageNumber=null;await expect(fillContentsNumbers(excluded,anchors,fakeRuntime,true)).rejects.toThrow(/no counted/);});

it('keeps field diagnostics and supports number blocks inside columns/font variants',async()=>{
 for(const [weight,fontStyle,fontId] of [['normal','normal','font-regular'],['bold','normal','font-bold'],['normal','italic','font-italic'],['bold','italic','font-bold-italic']]){
  const b=band();b.nodes.cols={id:'cols',type:'columns',props:{gap:{value:10,unit:'pt'}},columns:[{weight:1,childIds:['a']},{weight:1,childIds:[]}]};b.rootIds=['cols'];const st={body:{...styles.body,fontWeight:weight,fontStyle}};
  const m=await measurePageBand(b,st,250,fakeRuntime,{});expect(m.pageFields).toHaveLength(2);expect(m.commands[0]!.fontId).toBe(fontId);
 }
 const t=ownedTemplate();t.nodeModelVersion=16;const b=band();b.nodes.a.role={role:'paragraph'};b.nodes.a.children[1].width.value=9999;t.sections[0].header.fragment={rootIds:b.rootIds,nodes:b.nodes};const v:any=validateTemplate(t);expect(v.ok).toBe(true);const p:any=prepareGeneration(v.value,ownedRequest(t));const d:any=composeDocument(v.value,p.value);await expect(documentFlow(d.value,fakeRuntime)).rejects.toMatchObject({path:expect.stringMatching(/children\..*~p$/)});
});
