import {it,expect}from'vitest';
import {document,fakeRuntime}from'../helpers/document.js';
import {cellTableFlow}from'../../src/layout/cellTableFlow.js';
import {tableStartHeight}from'../../src/layout/tableStart.js';

function fixture(groups:number[]){
 const d:any=document();d.nodes.table={id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{unit:'pt',value:100}}],rowIds:['row']};
 d.nodes.row={id:'row',type:'table-row',props:{allowBreak:true},cellIds:['cell']};
 d.nodes.cell={id:'cell',type:'table-cell',props:{padding:Object.fromEntries(['top','bottom','left','right'].map(k=>[k,{unit:'pt',value:0}]))},childIds:groups.map((_,i)=>'p'+i)};
 groups.forEach((n,i)=>d.nodes['p'+i]={id:'p'+i,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'leaf'+i,type:'text',text:Array.from({length:n},(_,j)=>'L'+i+'-'+j).join('\n')}]});return d;
}
async function run(groups:number[],bottom:number,y=0,selected=true){
 const d=fixture(groups),items:{id:string;text:string;page:number;y:number}[]=[];let page=0;
 const s:any={top:0,bottom,left:0,y,availableWidth:100,nextPage(){if(++page>30)throw Error('No progress');this.y=0;},emitItem(i:any,x:number,y:number){items.push({id:i.nodeId,text:i.line.run.text,page,y});},border(){}};
 const runtime:any={...fakeRuntime,spacingProbe:{paragraphWidowOrphan:()=>selected}};
 await cellTableFlow(d,d.nodes.table,runtime,s);return {d,items,page,runtime};
}
it('moves a two-line paragraph when only its first line fits',async()=>{expect((await run([2],72,54)).items.map(i=>i.page)).toEqual([1,1]);});
it('carries the penultimate line with a singleton last line',async()=>{expect((await run([5],72)).items.map(i=>i.page)).toEqual([0,0,0,1,1]);});
it('moves three lines together if the next page can contain them',async()=>{expect((await run([3],72,36)).items.map(i=>i.page)).toEqual([1,1,1]);});
it('flows a long paragraph across many pages with two final lines',async()=>{
 const f=await run([13],72);expect(f.items.map(i=>i.page)).toEqual([0,0,0,0,1,1,1,1,2,2,2,3,3]);expect(new Set(f.items.map(i=>i.text)).size).toBe(13);
});
it('uses text-block boundaries rather than treating an entire cell as a paragraph',async()=>{expect((await run([1,2],72,36)).items.map(i=>i.page)).toEqual([0,1,1]);});
it('relaxes an impossible two-line minimum on a one-line page without looping',async()=>{expect((await run([5],18)).items.map(i=>i.page)).toEqual([0,1,2,3,4]);});
it('relaxes an impossible three-line split on a two-line page',async()=>{expect((await run([3],36)).items.map(i=>i.page)).toEqual([0,0,1]);});
it('does not change non-selected paragraphs',async()=>{expect((await run([5],72,0,false)).items.map(i=>i.page)).toEqual([0,0,0,0,1]);});
it('reserves the selected first paragraph minimum in heading/table preflight',async()=>{
 const f=await run([5],72);expect(await tableStartHeight(f.d,f.d.nodes.table,f.runtime)).toBe(36);
});
it('reserves all three lines when no legal widow-free split exists',async()=>{
 const f=await run([3],72);expect(await tableStartHeight(f.d,f.d.nodes.table,f.runtime)).toBe(54);
});
it('keeps a parallel requirement label with a moved two-line paragraph and repeated header',async()=>{
 const d=fixture([2]);d.nodes.table.columns.push({width:{unit:'pt',value:100}});d.nodes.row.cellIds.push('label');
 d.nodes.label={...d.nodes.cell,id:'label',childIds:['t']};
 d.nodes.table.props.headerRowCount=1;d.nodes.table.props.repeatHeaderRows=true;d.nodes.table.rowIds.unshift('header');
 d.nodes.header={id:'header',type:'table-row',props:{allowBreak:false},cellIds:['hc','hc2']};
 d.nodes.hc={...d.nodes.cell,id:'hc',childIds:['ht']};d.nodes.hc2={...d.nodes.cell,id:'hc2',childIds:[]};d.nodes.ht={...d.nodes.t,id:'ht'};
 const items:any[]=[];let page=0;const s:any={top:0,bottom:90,left:0,y:54,availableWidth:200,nextPage(){if(++page>10)throw Error('No progress');this.y=0;},emitItem(i:any){items.push({id:i.nodeId,page});},border(){}};
 await cellTableFlow(d,d.nodes.table,{...fakeRuntime,spacingProbe:{paragraphWidowOrphan:()=>true}},s);
 expect(items.filter(i=>i.id==='p0').map(i=>i.page)).toEqual([1,1]);expect(items.find(i=>i.id==='t').page).toBe(1);
});
it('reserves trailing cell padding without carrying one extra line at a widow cut',async()=>{
 const d=fixture([5]);d.nodes.cell.props.padding.top={unit:'pt',value:3.25};d.nodes.cell.props.padding.bottom={unit:'pt',value:3.25};
 const pages:number[]=[];let page=0;const s:any={top:0,bottom:80,left:0,y:0,availableWidth:100,nextPage(){if(++page>10)throw Error('No progress');this.y=0;},emitItem(){pages.push(page);},border(){}};
 await cellTableFlow(d,d.nodes.table,{...fakeRuntime,spacingProbe:{paragraphWidowOrphan:()=>true}},s);
 expect(pages).toEqual([0,0,0,1,1]);
});
