import {mergedDoc} from '../helpers/merged.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {textFlow} from '../../src/layout/textFlow.js';
import {resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
const make=()=>{const d=document();d.nodeModelVersion=7;return d;};
it('preserves display shaping and emits only linked portions across wrapped lines',async()=>{
 const d:any=make();d.book.page.margin.right={value:210-20-20*25.4/72,unit:'mm'};
 d.nodes.t.children=[{id:'a',type:'text',text:'ab'},{id:'link',type:'link',text:'cdefgh',url:'https://example.com'},{id:'z',type:'text',text:'ij'}];
 const draw=await textFlow(d,fakeRuntime);resolveLinkGeometry(d,draw);
 expect(draw.pages[0]!.commands.map(r=>r.text)).toEqual(['abcd','efgh','ij']);
 expect(draw.pages[0]!.annotations?.map(a=>[Math.round(a.rect.widthPt),Math.round(a.rect.xPt-draw.pages[0]!.commands[0]!.bounds.xPt)])).toEqual([[10,10],[20,0]]);
});
it('chooses first nonblank actual line and rejects an empty destination',async()=>{
 const d:any=make();d.nodes.t.props.anchorId='heading';d.nodes.t.children=[{id:'b',type:'text',text:'\n\nheading'},{id:'r',type:'reference',text:'back',target:'heading'}];
 const draw=await textFlow(d,fakeRuntime);resolveLinkGeometry(d,draw);expect(draw.anchors?.heading?.yPt).toBe(20*72/25.4+36);
 d.nodes.t.children=[{id:'b',type:'text',text:'\n  \n'}];expect(()=>resolveLinkGeometry(d,{pages:[]})).toThrow();
});
it('resolves a forward reference after the destination reflows to another page',async()=>{
 const d:any=make();d.nodes.t.props.anchorId='start';d.nodes.t.children=[{id:'go',type:'reference',text:'next',target:'end'},{id:'filler',type:'text',text:'\nline'.repeat(60)}];
 d.nodes.end={id:'end',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:'end'},children:[{id:'back',type:'reference',text:'back',target:'start'}]};d.rootIds.push('end');
 const draw=await textFlow(d,fakeRuntime);resolveLinkGeometry(d,draw);expect(draw.anchors?.end?.pageIndex).toBe(1);expect(draw.anchors?.start?.pageIndex).toBe(0);expect(draw.pages[1]!.annotations).toHaveLength(1);
});
it('assigns whole inseparable clusters and rejects adjacent links sharing one',async()=>{
 const runtime={...fakeRuntime,async shape(text:string){return {ascentPt:10,descentPt:3,glyphs:[{glyphId:1,advancePt:10,offsetXPt:-2,offsetYPt:0,clusterStartOffset:0,clusterEndOffset:text.length}]};}};
 const d:any=make();d.nodes.t.children=[{id:'a',type:'link',text:'ก',url:'https://example.com'},{id:'b',type:'text',text:'้'}];
 const draw=await textFlow(d,runtime);resolveLinkGeometry(d,draw);expect(draw.pages[0]!.annotations?.[0]?.rect.widthPt).toBeCloseTo(12);
 d.nodes.t.children[1]={id:'b',type:'link',text:'้',url:'https://example.org'};const ambiguous=await textFlow(d,runtime);expect(()=>resolveLinkGeometry(d,ambiguous)).toThrow(/cluster/);
});
it('keeps the first physical copy of a repeated destination and leaves legacy data unchanged',async()=>{
 const d:any=make();d.nodes.t.props.anchorId='head';const draw=await textFlow(d,fakeRuntime);draw.pages.push(structuredClone(draw.pages[0]!));resolveLinkGeometry(d,draw);expect(draw.anchors?.head?.pageIndex).toBe(0);
 const old=document();const legacy=await textFlow(old,fakeRuntime),before=JSON.stringify(legacy);resolveLinkGeometry(old,legacy);expect(JSON.stringify(legacy)).toBe(before);
});

it('preserves clickable lines through merged cell continuation and repeated headers',async()=>{const d=mergedDoc(100);d.nodeModelVersion=7;d.nodes.at.props.anchorId='cell';d.nodes.at.children=[{id:'linked',type:'link',text:Array.from({length:100},(_,i)=>'A'+i).join('\n'),url:'https://example.com'}];const draw=await documentFlow(d,fakeRuntime);resolveLinkGeometry(d,draw);expect(draw.pages.length).toBeGreaterThan(2);expect(draw.pages.flatMap(p=>p.annotations??[])).toHaveLength(100);expect(draw.anchors?.cell?.pageIndex).toBe(0);});
