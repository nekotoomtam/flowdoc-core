import {it,expect} from 'vitest';
import {sizingTemplate,composeSizing,sizingEntry} from '../helpers/formatSizing.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
import {rowGroupTemplate} from '../helpers/rowGroups.js';
import {mergedDoc} from '../helpers/merged.js';
function tableTemplate(height:number,allowBreak=true){
 const t=sizingTemplate({mode:'fixed',height:{value:height,unit:'pt'}}),f=t.areaFormats.panel;
 f.fragment.nodes.cell={id:'cell',type:'table-cell',props:{},childIds:['text']};f.fragment.nodes.row={id:'row',type:'table-row',props:{allowBreak},cellIds:['cell']};f.fragment.nodes.table={id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:200,unit:'pt'}}],rowIds:['row']};f.fragment.rootIds=['table'];return t;
}
const flat=(r:any)=>r.pages.flatMap((p:any)=>p.commands.map((c:any)=>c.text));
it('keeps an earlier fitting row when a later row has padding taller than the frame',async()=>{
 const t=tableTemplate(80),n=t.areaFormats.panel.fragment.nodes;
 n.text2={...structuredClone(n.text),id:'text2',children:[{id:'tail',type:'text',text:'HIDDEN'}]};
 n.cell2={id:'cell2',type:'table-cell',props:{padding:{top:{value:100,unit:'pt'},bottom:{value:100,unit:'pt'},left:{value:4,unit:'pt'},right:{value:4,unit:'pt'}}},childIds:['text2']};
 n.row2={id:'row2',type:'table-row',props:{allowBreak:true},cellIds:['cell2']};n.table.rowIds.push('row2');
 const r=await documentFlow(composeSizing(t,[sizingEntry('PREFIX')]),fakeRuntime);expect(flat(r)).toEqual(['PREFIX']);expect(r.warnings![0]).toMatchObject({formatOmission:{pending:[{sourceNodeId:'text2'}]}});
});
it('fits two whole lines plus padding and stroke at exact frame height and closes the fragment',async()=>{
 const t=tableTemplate(48.5),d=composeSizing(t,[sizingEntry('A\nB\nC')]),before=structuredClone(d);const r=await documentFlow(d,fakeRuntime);
 expect(flat(r)).toEqual(['A','B']);expect(r.warnings).toHaveLength(1);expect(r.warnings![0]).toMatchObject({code:'FORMAT_CONTENT_OMITTED',formatOmission:{pending:[{kind:'text',lineIndex:2,sourceNodeId:'text',cellId:expect.any(String),rowId:expect.any(String)}]}});
 const start=20*72/25.4;for(const b of r.pages[0]!.borders!)expect(Math.max(b.y1Pt,b.y2Pt)+b.widthPt/2).toBeLessThanOrEqual(start+48.5+1e-6);
 expect(r.pages[0]!.borders!.some(b=>Math.abs(b.y1Pt-(start+48.25))<1e-6&&b.y1Pt===b.y2Pt)).toBe(true);expect(d).toEqual(before);
});
it('moves the next full line out of a just-too-small slice and does not swallow a later Format call',async()=>{
 const t=tableTemplate(48.4999);t.areaFormats.after=structuredClone(sizingTemplate({mode:'fixed',height:{value:20,unit:'pt'}}).areaFormats.panel);t.areaFormats.after.key='after';
 const r=await documentFlow(composeSizing(t,[sizingEntry('A\nB\nC'),{format:'after',data:{text:'NEXT'}}]),fakeRuntime);
 expect(flat(r)).toEqual(['A','NEXT']);expect(r.pages).toHaveLength(1);expect(r.warnings![0]).toMatchObject({formatOmission:{areaEntryIndex:0,pending:[{lineIndex:1}]}});
});
it('does not split a protected row that exceeds the fixed remainder',async()=>{
 const r=await documentFlow(composeSizing(tableTemplate(48.5,false),[sizingEntry('A\nB\nC')]),fakeRuntime);
 expect(flat(r)).toEqual([]);expect(r.pages[0]!.borders??[]).toEqual([]);expect(r.warnings![0]).toMatchObject({formatOmission:{reason:'unbreakable-item-does-not-fit'}});
});
it('does not paint an isolated table header in fixed when its first body unit cannot fit',async()=>{
 const t=tableTemplate(40);const n=t.areaFormats.panel.fragment.nodes;n.headerText={...structuredClone(n.text),id:'headerText',children:[{id:'headerValue',type:'text',text:'HEADER'}]};n.hcell={id:'hcell',type:'table-cell',props:{},childIds:['headerText']};n.hrow={id:'hrow',type:'table-row',props:{allowBreak:false},cellIds:['hcell']};n.table.rowIds.unshift('hrow');n.table.props.headerRowCount=1;n.table.props.repeatHeaderRows=true;
 const r=await documentFlow(composeSizing(t,[sizingEntry('BODY')]),fakeRuntime);expect(flat(r)).toEqual([]);expect(r.pages[0]!.borders??[]).toEqual([]);expect(r.warnings![0].code).toBe('FORMAT_CONTENT_OMITTED');
});
it('keeps a whole meeting Format semantic group and stops only its first invocation',async()=>{
 const t=sizingTemplate({mode:'fixed',height:{value:150,unit:'pt'}});t.areaFormats.panel={...structuredClone(rowGroupTemplate().areaFormats.meeting),key:'panel',ownerAreaId:'parts',sizing:{mode:'fixed',height:{value:150,unit:'pt'}}};t.areaFormats.panel.rowGroups[0].pagination.keepStart=true;
 const entries=[{format:'panel',data:{companies:[{name:'COMPANY',members:['A','B','C','D'].map(name=>({name}))}]}},{format:'panel',data:{companies:[]}}];
 const r=await documentFlow(composeSizing(t,entries),fakeRuntime);expect(flat(r)).toEqual(['before','COMPANY','labels','A','B','before','after']);expect(r.warnings).toHaveLength(1);expect(r.warnings![0]).toMatchObject({formatOmission:{areaEntryIndex:0,pending:[{groupId:'companies',groupIndex:0,itemIndex:2,lineIndex:0}]}});
 t.areaFormats.panel.sizing.height.value=100;const short=await documentFlow(composeSizing(t,entries),fakeRuntime);expect(flat(short)).toEqual(['before','before','after']);expect(short.warnings![0].code).toBe('FORMAT_CONTENT_OMITTED');
});
it('closes merged cells with independent whole-line cursors and no border outside the frame',async()=>{
 const t=sizingTemplate({mode:'fixed',height:{value:100,unit:'pt'}}),m=mergedDoc(20);t.areaFormats.panel.fragment={rootIds:m.rootIds,nodes:m.nodes};
 const r=await documentFlow(composeSizing(t,[sizingEntry('unused')]),fakeRuntime);expect(r.pages).toHaveLength(1);const a=flat(r).filter((x:string)=>/^A\d+$/.test(x));expect(a.length).toBeGreaterThan(0);expect(new Set(a).size).toBe(a.length);expect(a.length).toBeLessThan(20);
 const start=20*72/25.4;for(const b of r.pages[0]!.borders!)expect(Math.max(b.y1Pt,b.y2Pt)+b.widthPt/2).toBeLessThanOrEqual(start+100+1e-6);
 expect(r.warnings![0]).toMatchObject({formatOmission:{pending:expect.arrayContaining([expect.objectContaining({cellId:expect.any(String)})])}});
});
it('handles cell images as whole units for fixed and opt-in auto',async()=>{
 const t=tableTemplate(80),f=t.areaFormats.panel;f.inputSchema.fields.photo={type:'image',required:true};f.fragment.nodes.pic={id:'pic',type:'image',props:{width:{value:20,unit:'pt'},height:{value:1000,unit:'pt'},source:{scope:'local',key:'photo'}}};f.fragment.nodes.cell.childIds.push('pic');
 const entries=[{format:'panel',data:{text:'TEXT',photo:'22222222-2222-4222-8222-222222222222'}}];
 const r=await documentFlow(composeSizing(t,entries),fakeRuntime);expect(flat(r)).toEqual(['TEXT']);expect(r.warnings![0]).toMatchObject({code:'FORMAT_CONTENT_OMITTED',formatOmission:{reason:'image-does-not-fit',pending:[{kind:'image'}]}});
 f.sizing={mode:'auto'};const auto=await documentFlow(composeSizing(t,entries),fakeRuntime);expect(auto.pages).toHaveLength(1);expect(flat(auto)).toEqual(['TEXT']);expect(auto.warnings![0].code).toBe('FORMAT_IMAGE_NOT_SHOWN');
});
