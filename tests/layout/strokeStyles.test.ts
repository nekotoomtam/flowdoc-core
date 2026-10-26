import {expect,it} from 'vitest';
import {mergedTemplate,mergedDoc} from '../helpers/merged.js';
import {fakeRuntime} from '../helpers/document.js';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {buildPageContent} from '../../src/pdf/primitives.js';
import {sizingTemplate,composeSizing} from '../helpers/formatSizing.js';
const pt=(value:number)=>({value,unit:'pt'});
const take=(r:any)=>{if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
it('accepts B at exact EMU width while keeping native table weights on eighth-points',()=>{
 const t=mergedTemplate(),p=t.areaFormats.merged.fragment.nodes.table.props;
 Object.assign(p,{borderStyle:'thickThinWideGap',borderWidth:pt(.35),borders:{headerBottom:{style:'thickThinWideGap'},insideHorizontal:{style:'none'}}});
 expect(validateTemplate(t).ok).toBe(true);expect(validateResolvedDocument(composed(t))).toEqual([]);
 p.borders.headerBottom={style:'single'};expect(validateTemplate(t).ok).toBe(false);
});
it('keeps B table-only and rejects it for a standalone rule',()=>{
 const t=mergedTemplate(),f=t.areaFormats.merged;
 f.fragment.nodes.rule={id:'rule',type:'line',props:{lineStyle:'thickThinWideGap',thickness:pt(.35)}};f.fragment.rootIds.push('rule');
 expect(validateTemplate(t).ok).toBe(false);
});
it('rejects explicit null or undefined nested widths rather than treating them as omitted',()=>{
 for(const width of [null,undefined]){const t=mergedTemplate();t.areaFormats.merged.fragment.nodes.table.props.borders={top:{width}};expect(validateTemplate(t).ok).toBe(false);}
});
it('paints B as two flat sparse components inside its total 0.35pt envelope',()=>{
 const page:any={widthPt:100,heightPt:100,backgroundColor:'FFFFFF',commands:[],borders:[{nodeId:'b',x1Pt:10,y1Pt:20,x2Pt:90,y2Pt:20,widthPt:.35,color:'000000',style:'thickThinWideGap'}]};
 const s=buildPageContent(page,[],new Map()).toString();
 expect(s).toContain('0.21 w');expect(s).toContain('0.07 w');expect(s).toContain('[1.4 4.2] 0 d');expect(s).toContain('0 J');expect(s.match(/ l S/g)).toHaveLength(2);
 expect(s).toContain('10 80.07 m');expect(s).toContain('10 79.86 m');
});
function composed(t:any){const v=take(validateTemplate(t));return take(composeDocument(v,take(prepareGeneration(v,{docKey:t.docKey,sections:{main:{data:{details:[{format:'merged',data:{}}]}}}}))));}
it.each(['single','none','dashed','dotted','double','dashSmallGap'])('accepts shared table and rule kind %s at authored/resolved boundaries',kind=>{
 const t=mergedTemplate(),f=t.areaFormats.merged;f.fragment.nodes.table.props={...f.fragment.nodes.table.props,borderStyle:kind,borderWidth:pt(.75)};
 f.fragment.nodes.rule={id:'rule',type:'line',props:{lineStyle:kind,thickness:pt(.75),color:'123456'}};f.fragment.rootIds.push('rule');
 expect(validateTemplate(t).ok).toBe(true);expect(validateResolvedDocument(composed(t))).toEqual([]);
});
it.each([.25,.5,1])('scales the measured E vector paint at nominal width %s without changing its frame',width=>{
 const page:any={widthPt:100,heightPt:100,backgroundColor:'FFFFFF',commands:[],borders:[{nodeId:'e',x1Pt:10,y1Pt:20,x2Pt:90,y2Pt:20,widthPt:width,color:'224466',style:'dashSmallGap'}]};
 const s=buildPageContent(page,[],new Map()).toString();expect(s).toContain(`${.96*width} w`);expect(s).toContain(`[${3.2*width} ${1.6*width}] 0 d`);expect(s).toContain('0 J');expect(s).toContain('10 80 m');expect(s).toContain('90 80 l S');
});
it.each([{borderWidth:pt(0)},{borderWidth:pt(.3)},{borderWidth:pt(12.125)},{borders:{insideHorizontal:{width:pt(-1)}}},{borders:{headerBottom:{color:'red'}}},{borders:{diagonal:{style:'single'}}},{borders:{left:{style:'dashed',unknown:true}}}])('rejects invalid table stroke %j at both boundaries',props=>{
 const t=mergedTemplate(),d=composed(t);Object.assign(t.areaFormats.merged.fragment.nodes.table.props,props);expect(validateTemplate(t).ok).toBe(false);
 Object.assign(Object.values(d.nodes).find((x:any)=>x.type==='table')!.props,props);expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
it('selects mixed outer/interior/header edges through merged multi-page PDF tables',async()=>{
 const d=mergedDoc(100);d.nodes.table.props.borders={top:{style:'none'},left:{style:'none'},right:{style:'double',width:pt(.75),color:'224466'},bottom:{style:'double',width:pt(.75)},insideHorizontal:{style:'none'},insideVertical:{style:'dotted',width:pt(.5)},headerBottom:{style:'single',width:pt(1),color:'123456'}};
 const draw=await documentFlow(d,fakeRuntime);expect(draw.pages.length).toBeGreaterThan(1);
 for(const p of draw.pages){const b=p.borders??[];expect(b.some(x=>x.style==='dotted')).toBe(true);expect(b.some(x=>x.style==='double'&&x.widthPt===.75)).toBe(true);expect(b.some(x=>x.color==='123456'&&x.widthPt===1)).toBe(true);
  const horizontals=b.filter(x=>x.y1Pt===x.y2Pt);expect(horizontals.every(x=>x.style==='double'||x.color==='123456')).toBe(true);
 }
});
it('encodes PDF dash, dot and double independently without leaking graphics state',()=>{
 const border=(style:string,y:number)=>({nodeId:style,x1Pt:10,y1Pt:y,x2Pt:90,y2Pt:y,widthPt:1,color:'224466',style});
 const page:any={widthPt:100,heightPt:100,backgroundColor:'FFFFFF',commands:[],borders:[border('dashed',10),border('dotted',20),border('double',30),border('single',40)]};
 const s=buildPageContent(page,[],new Map()).toString();expect(s).toContain('[3 2] 0 d');expect(s).toContain('[0 2] 0 d');expect(s).toContain('1 J');expect(s.match(/ l S/g)).toHaveLength(5);
});
it('keeps new wide table stroke envelopes within a zero-margin page',async()=>{
 const d=mergedDoc(1);d.book.page.margin={top:pt(0),bottom:pt(0),left:pt(0),right:pt(0)};
 d.nodes.table.props.borderStyle='double';d.nodes.table.props.borderWidth=pt(2);
 const draw=await documentFlow(d,fakeRuntime);
 for(const p of draw.pages)for(const b of p.borders??[]){const half=b.widthPt*(b.style==='double'?1.5:.5);expect(Math.min(b.x1Pt,b.x2Pt)).toBeGreaterThanOrEqual(half);expect(Math.max(b.x1Pt,b.x2Pt)).toBeLessThanOrEqual(p.widthPt-half);expect(Math.min(b.y1Pt,b.y2Pt)).toBeGreaterThanOrEqual(half);expect(Math.max(b.y1Pt,b.y2Pt)).toBeLessThanOrEqual(p.heightPt-half);}
});
it('inherits table color/weight while allowing selected strokes over a none base',async()=>{
 const d=mergedDoc(1);Object.assign(d.nodes.table.props,{borderStyle:'none',borderColor:'224466',borderWidth:pt(1),borders:{insideVertical:{style:'dashed'},headerBottom:{style:'dotted'}}});
 const draw=await documentFlow(d,fakeRuntime),strokes=draw.pages.flatMap(p=>p.borders??[]);expect(strokes.length).toBeGreaterThan(0);expect(strokes.every(b=>b.widthPt===1&&b.color==='224466'&&['dashed','dotted'].includes(b.style!))).toBe(true);
});
it('accepts equivalent mm stroke weights and rejects unknown rule kinds',()=>{
 const t=mergedTemplate();t.areaFormats.merged.fragment.nodes.table.props.borderWidth={unit:'mm',value:.75*25.4/72};expect(validateTemplate(t).ok).toBe(true);
 const f=t.areaFormats.merged;f.fragment.nodes.rule={id:'rule',type:'line',props:{lineStyle:'wave'}};f.fragment.rootIds.push('rule');expect(validateTemplate(t).ok).toBe(false);
});
it('uses the outer bottom border for a header-only table',async()=>{
 const d=mergedDoc(1);d.nodes.table.rowIds=['header'];d.nodes.table.props.borders={bottom:{style:'none'},headerBottom:{style:'double',width:pt(1)}};
 const draw=await documentFlow(d,fakeRuntime);expect(draw.pages.flatMap(p=>p.borders??[]).some(b=>b.style==='double')).toBe(false);
});
it('rejects a styled fragment whose clamped stroke segment would collapse',async()=>{
 const d=mergedDoc(1);d.book.page.margin={top:pt(0),bottom:pt(0),left:pt(0),right:pt(0)};d.nodes.table.props.borderStyle='double';d.nodes.table.props.borderWidth=pt(12);
 for(const n of Object.values(d.nodes) as any[])if(n.type==='table-cell')n.props.padding={top:pt(0),bottom:pt(0)};
 await expect(documentFlow(d,fakeRuntime)).rejects.toMatchObject({nodeId:'table'});
});
it('keeps mixed-width corner anchors joined at zero page margins',async()=>{
 const d=mergedDoc(1);d.book.page.margin={top:pt(0),bottom:pt(0),left:pt(0),right:pt(0)};d.nodes.table.props.borders={left:{style:'double',width:pt(2)},right:{style:'double',width:pt(1)}};
 const draw=await documentFlow(d,fakeRuntime),b=draw.pages[0]!.borders!,h=b.find(x=>x.y1Pt===x.y2Pt)!,v=b.find(x=>x.x1Pt===x.x2Pt)!;
 expect(h.x1Pt).toBe(v.x1Pt);expect(h.y1Pt).toBe(v.y1Pt);
});
it('contains round dotted end caps within their fixed-format horizontal frame',async()=>{
 const t=sizingTemplate({mode:'fixed',height:pt(12)}),f=t.areaFormats.panel;
 f.fragment={rootIds:['rule'],nodes:{rule:{id:'rule',type:'line',props:{lineStyle:'dotted',thickness:pt(12)}}}};
 const d=composeSizing(t),draw=await documentFlow(d,fakeRuntime),b=draw.pages[0]!.borders!.find(x=>x.style==='dotted')!;
 const p=d.book.page,left=p.margin.left.value*72/25.4,right=draw.pages[0]!.widthPt-p.margin.right.value*72/25.4;
 expect(b.x1Pt-6).toBeGreaterThanOrEqual(left-1e-6);expect(b.x2Pt+6).toBeLessThanOrEqual(right+1e-6);
});
