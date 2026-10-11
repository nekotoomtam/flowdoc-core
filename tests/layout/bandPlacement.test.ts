import {it,expect} from 'vitest';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
const pt=(value:number)=>({value,unit:'pt'});
const placement=(left=0,right=0,offset=0)=>({mode:'page',left:pt(left),right:pt(right),offset:pt(offset)});
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
function template(){const t=ownedTemplate();t.nodeModelVersion=16;for(const s of t.sections){s.header.placement=placement();s.footer=structuredClone(s.header);s.footer.placement=placement(12,18,5);s.footer.fragment.nodes.head.children=[{id:'foot',type:'text',text:'FOOT'}];}return t;}
async function draw(t:any){const v=ok(validateTemplate(t));return documentFlow(ok(composeDocument(v,ok(prepareGeneration(v,ownedRequest(t))))),fakeRuntime);}
it('places bands against page edges in portrait and landscape while body keeps its margins',async()=>{
 const t=template(),d=await draw(t);
 for(const p of d.pages){const h=p.commands.find(c=>c.id.startsWith('header-'))!,f=p.commands.find(c=>c.id.startsWith('footer-'))!,b=p.commands.find(c=>c.nodeId.includes('title'))!;
 expect(h.bounds.xPt).toBe(0);expect(h.bounds.yPt).toBe(0);expect(f.bounds.xPt).toBe(12);expect(f.bounds.yPt).toBeCloseTo(p.heightPt-5-t.styles.body.lineHeightPt);expect(b.bounds.xPt).toBeGreaterThan(0);expect(b.bounds.yPt).toBeGreaterThanOrEqual(h.bounds.yPt+t.styles.body.lineHeightPt);}
 const old=structuredClone(t);for(const s of old.sections){delete s.header.placement;delete s.footer.placement;}
 const legacy=await draw(old);expect(legacy.pages[0]!.commands[0]!.bounds.xPt).toBeGreaterThan(0);
});
it('reserves only actual overlap and gap, suppresses bands on cover',async()=>{const t=template();t.sections[0].header.placement.offset=pt(80);t.sections[0].header.gap=pt(7);const d=await draw(t);expect(d.pages[0]!.commands.find(c=>c.nodeId.includes('title'))!.bounds.yPt).toBe(80+t.styles.body.lineHeightPt+7);t.sections[0].role='cover';const c=await draw(t);expect(c.pages[0]!.commands.some(c=>c.id.startsWith('header-')||c.id.startsWith('footer-'))).toBe(false);});
it('rejects malformed placement and impossible page regions',async()=>{for(const bad of [{mode:'page'},placement(-1),{...placement(),mode:'other'}]){const t=template();t.sections[0].header.placement=bad;expect(validateTemplate(t).ok).toBe(false);}for(const bad of [placement(999),placement(0,0,999)]){const t=template();t.sections[0].header.placement=bad;await expect(draw(t)).rejects.toThrow();}});
it('uses independent width for images and page fields over repeated pages',async()=>{
 const t=template();t.sections=t.sections.slice(0,1);const s=t.sections[0];
 s.header.fragment.nodes.head.children=[{id:'p',type:'system-page-field',field:'current',width:pt(24)}];s.header.placement=placement(8,9,2);
 s.source.fragment.nodes.title.children=[{id:'body',type:'text',text:Array(90).fill('BODY').join('\n')}];
 const request=ownedRequest(t);delete request.sections.two;const v=ok(validateTemplate(t)),d=ok(composeDocument(v,ok(prepareGeneration(v,request))));
 const h=d.sections[0].header;h.rootIds.push('image');h.nodes.image={id:'image',type:'image',props:{resourceId:'img',width:pt(575),height:pt(10)}};
 const result=await documentFlow(d,fakeRuntime,{img:{kind:'rgb',bytes:new Uint8Array(3),width:1,height:1}});
 expect(result.pages.length).toBeGreaterThan(1);
 for(const [i,p] of result.pages.entries()){
  expect(p.images![0]!.xPt).toBeGreaterThanOrEqual(8);
  expect(result.pageFieldSlots!.find(f=>f.pageIndex===i)!.xPt).toBe(8);
  const body=p.commands.filter(c=>c.text==='BODY'),footer=p.commands.find(c=>c.id.startsWith('footer-'))!;
  expect(body.at(-1)!.bounds.yPt+t.styles.body.lineHeightPt).toBeLessThanOrEqual(footer.bounds.yPt);
 }
});

