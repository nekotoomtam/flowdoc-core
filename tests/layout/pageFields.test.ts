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
const styles:any={body:{fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:12,unit:'pt'},lineHeightPt:20}};
const band=():any=>({baseTextStyleId:'body',rootIds:['a'],nodes:{a:{id:'a',type:'text-block',props:{textStyleId:'body'},children:[{id:'label',type:'text',text:'Page '},{id:'p',type:'system-page-field',field:'current',width:{value:24,unit:'pt'}},{id:'of',type:'text',text:' / '},{id:'t',type:'system-page-field',field:'total',width:{value:24,unit:'pt'}}]}}});
it('reserves two atomic number slots beside static text',async()=>{const m:any=await measurePageBand(band(),styles,200,fakeRuntime,{});expect(m.pageFields).toHaveLength(2);expect(m.heightPt).toBe(20);expect(m.commands.map((r:any)=>r.text).join('')).toBe('Page  / ');});
it('fails a slot wider than the available band',async()=>{await expect(measurePageBand(band(),styles,20,fakeRuntime,{})).rejects.toThrow();});
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
