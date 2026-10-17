import {it,expect} from 'vitest';
import {sizingTemplate,composeSizing,sizingEntry,setSizingBodyHeight} from '../helpers/formatSizing.js';
import {fakeRuntime} from '../helpers/document.js';
import {mergedDoc} from '../helpers/merged.js';
import {rowGroupTemplate} from '../helpers/rowGroups.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';
const fixed={mode:'fixed',height:{value:300,unit:'pt'}};
const flat=(r:any)=>r.pages.flatMap((p:any)=>p.commands.map((c:any)=>c.text));
function reduced(height:number){const t=sizingTemplate(fixed);setSizingBodyHeight(t,height);return t;}
function table(height:number,allowBreak=true){
 const t=reduced(height),n=t.areaFormats.panel.fragment.nodes;
 n.cell={id:'cell',type:'table-cell',props:{},childIds:['text']};n.row={id:'row',type:'table-row',props:{allowBreak},cellIds:['cell']};
 n.table={id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:200,unit:'pt'}}],rowIds:['row']};t.areaFormats.panel.fragment.rootIds=['table'];return t;
}
function closeWithin(r:any,height:number){
 const bottom=20*72/25.4+height,borders=r.pages[0].borders??[];
 for(const b of borders)expect(Math.max(b.y1Pt,b.y2Pt)+b.widthPt/2).toBeLessThanOrEqual(bottom+1e-6);
 if(borders.length){const y=Math.max(...borders.map((b:any)=>Math.max(b.y1Pt,b.y2Pt)));expect(borders.some((b:any)=>b.y1Pt===y&&b.y2Pt===y&&b.x2Pt>b.x1Pt)).toBe(true);}
}
it.each([[48.5,2],[48.4999,1],[.1,0]])('closes a table in reduced %spt with %s whole lines',async(height,count)=>{
 const t=table(height),d=composeSizing(t,[sizingEntry('A\nB\nC'),sizingEntry('HIDDEN')]),before=structuredClone(d),r=await documentFlow(d,fakeRuntime);
 expect(flat(r)).toEqual(['A','B'].slice(0,count));expect(r.pages).toHaveLength(1);closeWithin(r,height);
 expect(r.warnings).toMatchObject([{code:'FORMAT_CONTENT_OMITTED',formatOmission:{areaEntryIndex:0,pending:[{lineIndex:count,sourceNodeId:'text',cellId:expect.any(String)}]}},{code:'FORMAT_FRAME_NOT_SHOWN',formatFrameOmission:{areaEntryIndex:1,availableHeightPt:0}}]);expect(d).toEqual(before);
});
it('preserves earlier rows before an unbreakable row in the reduced frame',async()=>{
 const t=table(60),n=t.areaFormats.panel.fragment.nodes;
 n.tail={...structuredClone(n.text),id:'tail',children:[{id:'v',type:'text',text:'NO1\nNO2\nNO3'}]};n.c2={id:'c2',type:'table-cell',props:{},childIds:['tail']};n.r2={id:'r2',type:'table-row',props:{allowBreak:false},cellIds:['c2']};n.table.rowIds.push('r2');
 const r=await documentFlow(composeSizing(t,[sizingEntry('PREFIX')]),fakeRuntime);expect(flat(r)).toEqual(['PREFIX']);closeWithin(r,60);expect(r.warnings![0]).toMatchObject({formatOmission:{pending:[{sourceNodeId:'tail',lineIndex:0}]}});
});
it('does not draw a header when its first body line cannot fit the reduced frame',async()=>{
 const t=table(40),n=t.areaFormats.panel.fragment.nodes;n.htext={...structuredClone(n.text),id:'htext',children:[{id:'h',type:'text',text:'HEADER'}]};n.hcell={id:'hcell',type:'table-cell',props:{},childIds:['htext']};n.hrow={id:'hrow',type:'table-row',props:{allowBreak:false},cellIds:['hcell']};n.table.rowIds.unshift('hrow');n.table.props={headerRowCount:1,repeatHeaderRows:true};
 const r=await documentFlow(composeSizing(t,[sizingEntry('BODY')]),fakeRuntime);expect(flat(r)).toEqual([]);expect(r.pages[0]!.borders??[]).toEqual([]);expect(r.warnings![0].code).toBe('FORMAT_CONTENT_OMITTED');
});
it('keeps group prefix with its first member rather than relaxing in a reduced frame',async()=>{
 const t=reduced(100);t.areaFormats.panel={...structuredClone(rowGroupTemplate().areaFormats.meeting),key:'panel',ownerAreaId:'parts',sizing:fixed};t.areaFormats.panel.rowGroups[0].pagination.keepStart=true;
 const r=await documentFlow(composeSizing(t,[{format:'panel',data:{companies:[{name:'COMPANY',members:[{name:'A'},{name:'B'}]}]}}]),fakeRuntime);
 expect(flat(r)).toEqual(['before']);expect(r.warnings).toHaveLength(1);expect(r.warnings![0]).toMatchObject({code:'FORMAT_CONTENT_OMITTED',formatOmission:{pending:[{groupId:'companies',groupIndex:0}]}});closeWithin(r,100);
});
it('closes merged cells and retains independent cursors in a reduced frame',async()=>{
 const t=reduced(100),m=mergedDoc(20);t.areaFormats.panel.fragment={rootIds:m.rootIds,nodes:m.nodes};const r=await documentFlow(composeSizing(t),fakeRuntime);
 expect(flat(r)).toEqual(['HEADER','A0','A1','A2','B','C','E']);closeWithin(r,100);expect(r.warnings![0]).toMatchObject({formatOmission:{pending:[{sourceNodeId:'at',lineIndex:3,cellId:expect.any(String),rowId:expect.any(String),tableId:expect.any(String)}]}});
});
it('reports both active unfinished cells at a reduced cut through a rowspan',async()=>{
 const t=table(90),n=t.areaFormats.panel.fragment.nodes;n.table.columns=[{width:{value:100,unit:'pt'}},{width:{value:100,unit:'pt'}}];n.cell.props={columnIndex:0,rowSpan:2};
 for(const [id,text] of [['b','B'],['c','C1\nC2\nC3\nC4\nC5']]){n[id!]={id,type:'table-cell',props:{columnIndex:1},childIds:[id+'text']};n[id+'text']={id:id+'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:id+'v',type:'text',text}]};}
 n.row.cellIds.push('b');n.row2={id:'row2',type:'table-row',props:{allowBreak:true},cellIds:['c']};n.table.rowIds.push('row2');
 const r=await documentFlow(composeSizing(t,[sizingEntry('A1\nA2\nA3\nA4\nA5\nA6\nA7\nA8')]),fakeRuntime);
 expect(r.warnings![0].formatOmission.pending).toEqual(expect.arrayContaining([expect.objectContaining({sourceNodeId:'text',lineIndex:4}),expect.objectContaining({sourceNodeId:'ctext',lineIndex:2})]));closeWithin(r,90);
});
it('does not hide invalid cell width as a normal reduced-frame omission',async()=>{
 const t=table(10);t.areaFormats.panel.fragment.nodes.cell.props.padding={left:{value:101,unit:'pt'},right:{value:101,unit:'pt'},top:{value:4,unit:'pt'},bottom:{value:4,unit:'pt'}};
 expect(()=>composeSizing(t)).toThrow('INVALID_TEMPLATE');
});
it.each([false,true])('stops before a whole image in reduced root/cell=%s without showing its tail',async inCell=>{
 const t=inCell?table(38.5):reduced(30),f=t.areaFormats.panel,n=f.fragment.nodes;f.inputSchema.fields.photo={type:'image',required:true};n.pic={id:'pic',type:'image',props:{width:{value:20,unit:'pt'},height:{value:20,unit:'pt'},source:{scope:'local',key:'photo'}}};n.tail={...structuredClone(n.text),id:'tail',children:[{id:'v',type:'text',text:'TAIL'}]};(inCell?n.cell.childIds:f.fragment.rootIds).push('pic','tail');
 t.areaFormats.flow={...structuredClone(sizingTemplate({mode:'auto'}).areaFormats.panel),key:'flow'};
 const entries=[{format:'panel',data:{text:'PREFIX',photo:'22222222-2222-4222-8222-222222222222'}},{format:'flow',data:{text:'NEXT'}}],d=composeSizing(t,entries),before=structuredClone(d),r=await documentFlow(d,fakeRuntime);
 expect(flat(r)).toEqual(['PREFIX','NEXT']);expect(r.pages).toHaveLength(2);expect(r.pages.flatMap(p=>p.images??[])).toEqual([]);expect(r.warnings).toHaveLength(1);expect(r.warnings![0]).toMatchObject({formatOmission:{reason:'image-does-not-fit',pending:[{kind:'image',sourceNodeId:'pic'}]}});expect(d).toEqual(before);closeWithin(r,inCell?38.5:30);
});
it.each([false,true])('validates atomic child before its reduced-frame fit (invalid=%s)',async invalid=>{
 const t=reduced(30),n=t.areaFormats.panel.fragment.nodes;n.child={...structuredClone(n.text),id:'child',props:{textStyleId:'body',heightMode:'fixed',height:{value:40,unit:'pt'}},children:[{id:'v',type:'text',text:invalid?'A\nB\nC':'CHILD'}]};t.areaFormats.panel.fragment.rootIds.push('child');
 if(invalid)await expect(documentFlow(composeSizing(t),fakeRuntime)).rejects.toThrow('Text exceeds reserved height');
 else {const r=await documentFlow(composeSizing(t),fakeRuntime);expect(flat(r)).toEqual(['A']);expect(r.warnings![0]).toMatchObject({formatOmission:{reason:'unbreakable-item-does-not-fit',pending:[{sourceNodeId:'child'}]}});}
});
it('stops at an explicit break without moving this fixed instance',async()=>{
 const t=reduced(60),f=t.areaFormats.panel;f.fragment.nodes.br={id:'br',type:'page-break'};f.fragment.rootIds.push('br');const r=await documentFlow(composeSizing(t),fakeRuntime);expect(r.pages).toHaveLength(1);expect(flat(r)).toEqual(['A']);expect(r.warnings![0]).toMatchObject({formatOmission:{reason:'explicit-page-break',pending:[{sourceNodeId:'br'}]}});
});
it.each([false,true])('resolves visible heading destinations and refuses omitted headings (omitted=%s)',async omitted=>{
 const t=reduced(omitted?20:40),n=t.areaFormats.panel.fragment.nodes;n.heading={id:'heading',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:'destination',toc:{level:1}},children:[{id:'h',type:'text',text:'HEADING'}]};t.areaFormats.panel.fragment.rootIds.push('heading');
 t.areaFormats.links={key:'links',ownerAreaId:'parts',sizing:{mode:'auto'},inputSchema:{type:'object',fields:{}},repeats:[],fragment:{rootIds:['ref','toc'],nodes:{ref:{id:'ref',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'link',type:'reference',text:'JUMP',target:'destination'}]},toc:{id:'toc',type:'table-of-contents',props:{textStyleId:'body',scope:{kind:'section'}}}}}};
 const d=composeSizing(t,[sizingEntry('PREFIX'),{format:'links',data:{}}]),r=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,r);
 if(omitted){expect(r.warnings![0].code).toBe('FORMAT_CONTENT_OMITTED');expect(()=>resolveLinkGeometry(d,r,anchors)).toThrow(expect.objectContaining({reason:'omitted-destination'}));await expect(fillContentsNumbers(r,anchors,fakeRuntime)).rejects.toThrow(expect.objectContaining({reason:'omitted-destination'}));}
 else {expect(Object.values(anchors)[0]!.pageIndex).toBe(0);await fillContentsNumbers(r,anchors,fakeRuntime);resolveLinkGeometry(d,r,anchors);expect(r.pages.flatMap(p=>p.commands).find(c=>c.id==='contents-number-0')!.text).toBe('1');expect(r.pages[1]!.annotations!.length).toBeGreaterThan(0);expect(r.warnings??[]).toEqual([]);}
});
