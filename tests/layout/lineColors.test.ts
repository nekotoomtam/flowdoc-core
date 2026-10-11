import {it,expect} from 'vitest';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
const pt=(value:number)=>({value,unit:'pt'}),line=(id:string)=>({id,type:'line',props:{color:'123456',thickness:pt(2),spaceBefore:pt(3),spaceAfter:pt(4)}});
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
async function render(t:any){const v=ok(validateTemplate(t));return documentFlow(ok(composeDocument(v,ok(prepareGeneration(v,ownedRequest(t))))),fakeRuntime);}
it('flows horizontal rules in body/header/footer with independent band positions',async()=>{const t=ownedTemplate();t.nodeModelVersion=16;for(const s of t.sections){s.source.fragment.rootIds.unshift('rule');s.source.fragment.nodes.rule=line('rule');s.header.fragment.rootIds.push('rule');s.header.fragment.nodes.rule=line('rule');s.footer=structuredClone(s.header);s.footer.fragment.nodes.head.children=[{id:'f',type:'text',text:'FOOT'}];}const d=await render(t);for(const p of d.pages){expect(p.borders).toHaveLength(3);expect(p.borders!.every(b=>b.color==='123456'&&b.widthPt===2&&b.y1Pt===b.y2Pt)).toBe(true);expect(p.borders![0]!.x2Pt-p.borders![0]!.x1Pt).toBeGreaterThan(400);}});
function colored(){const t=ownedTemplate();t.nodeModelVersion=16;const f=t.sections[0].source.fragment;f.rootIds=['table'];f.nodes={table:{id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true,headerFillColor:'DDEEFF',borderColor:'112233'},columns:[{width:pt(180)},{width:pt(180)}],rowIds:['hr','r']},hr:{id:'hr',type:'table-row',props:{allowBreak:false},cellIds:['hc']},hc:{id:'hc',type:'table-cell',props:{columnIndex:0,colSpan:2},childIds:['h']},h:{id:'h',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'ht',type:'text',text:'HEADER'}]},r:{id:'r',type:'table-row',props:{allowBreak:true},cellIds:['c']},c:{id:'c',type:'table-cell',props:{columnIndex:0,colSpan:2,fillColor:'FFEEDD'},childIds:['b']},b:{id:'b',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'bt',type:'text',text:Array(90).fill('BODY').join('\n')}]}};return t;}
it('repeats header fills and clips merged cell fills to each continued fragment',async()=>{const d=await render(colored());const pages=d.pages.filter(p=>p.fills?.length);expect(pages.length).toBeGreaterThan(1);for(const p of pages){expect(p.fills!.map(f=>f.color)).toEqual(['DDEEFF','FFEEDD']);expect(p.fills!.every(f=>f.widthPt===360&&f.heightPt>0&&f.yPt+f.heightPt<=p.heightPt)).toBe(true);expect(p.borders!.every(b=>b.color==='112233')).toBe(true);}expect(d.pages.flatMap(p=>p.commands).filter(c=>c.text==='BODY')).toHaveLength(90);});
it('explicit cell fill overrides the table header fill',async()=>{const t=colored();t.sections[0].source.fragment.nodes.hc.props.fillColor='ABCDEF';const d=await render(t);expect(d.pages[0]!.fills![0]!.color).toBe('ABCDEF');});
it('rejects invalid rules/colors and rules inside table cells',()=>{for(const props of [{color:'red'},{thickness:pt(0)},{width:pt(-1)}]){const t=ownedTemplate();t.sections[0].source.fragment.nodes.rule={...line('rule'),props};t.sections[0].source.fragment.rootIds.push('rule');expect(validateTemplate(t).ok).toBe(false);}const t=colored();t.sections[0].source.fragment.nodes.table.props.borderColor='bad';expect(validateTemplate(t).ok).toBe(false);const c=colored();c.sections[0].source.fragment.nodes.b=line('b');expect(validateTemplate(c).ok).toBe(false);});

it('keeps row-spanning fill continuous across pages',async()=>{const t=colored(),f=t.sections[0].source.fragment;f.nodes.table.rowIds.push('r2');f.nodes.r2={id:'r2',type:'table-row',props:{allowBreak:true},cellIds:[]};f.nodes.c.props.rowSpan=2;const d=await render(t);const fills=d.pages.flatMap(p=>p.fills??[]).filter(f=>f.color==='FFEEDD');expect(fills.length).toBeGreaterThan(1);expect(fills.every(f=>f.widthPt===360)).toBe(true);});
it('moves an indivisible line to the next page and rejects a wider-than-parent line',async()=>{const t=ownedTemplate();t.nodeModelVersion=16;const f=t.sections[0].source.fragment;f.nodes.title.children=[{id:'long',type:'text',text:Array(33).fill('BODY').join('\n')}];f.nodes.rule={...line('rule'),props:{spaceBefore:pt(500),thickness:pt(2)}};f.rootIds.push('rule');const d=await render(t);const rp=d.pages.findIndex(p=>p.borders?.some(b=>b.nodeId.endsWith('rule')));expect(rp).toBeGreaterThan(0);f.nodes.rule.props.width=pt(9999);await expect(render(t)).rejects.toThrow(/line geometry/);});


it('aligns short rules relative to body and independent band widths',async()=>{
 for(const align of ['left','center','right'] as const){
  const t=ownedTemplate();t.nodeModelVersion=16;const s=t.sections[0],rule={id:'aligned',type:'line',props:{width:pt(100),align}};
  s.source.fragment.rootIds=['aligned'];s.source.fragment.nodes={aligned:rule};
  const placement={mode:'page',left:pt(12),right:pt(22),offset:pt(5)};
  s.header={baseTextStyleId:'body',inputSchema:{type:'object',fields:{}},placement,fragment:{rootIds:['aligned'],nodes:{aligned:structuredClone(rule)}}};s.footer=structuredClone(s.header);
  const d=await render(t),p=d.pages[0]!,b=p.borders!,factor=align==='right'?1:align==='center'?.5:0;
  expect(b).toHaveLength(3);
  for(const stroke of b.slice(0,2))expect(stroke.x1Pt).toBeCloseTo(12+(p.widthPt-12-22-100)*factor);
  const margin=t.pageLayouts[s.pageLayoutId].page.margin,left=margin.left.value*72/25.4,right=margin.right.value*72/25.4;
  expect(b[2]!.x1Pt).toBeCloseTo(left+(p.widthPt-left-right-100)*factor);
  expect(b.every(v=>Math.abs(v.x2Pt-v.x1Pt-100)<1e-6)).toBe(true);
 }
});
it('rejects unsupported rule alignment',()=>{const t=ownedTemplate();t.sections[0].source.fragment.nodes.bad={...line('bad'),props:{align:'justify'}};t.sections[0].source.fragment.rootIds.push('bad');expect(validateTemplate(t).ok).toBe(false);});
