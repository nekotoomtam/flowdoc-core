import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {cellTableFlow} from '../../src/layout/cellTableFlow.js';
import {tableStartHeight} from '../../src/layout/tableStart.js';

function fixture(){
 const d:any=document();d.nodes.table={id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true},columns:[{width:{unit:'pt',value:100}}],rowIds:['h','b']};
 for(const id of ['h','b']){d.nodes[id]={id,type:'table-row',props:{allowBreak:true},cellIds:[id+'c']};d.nodes[id+'c']={id:id+'c',type:'table-cell',props:{padding:{top:{unit:'pt',value:3},bottom:{unit:'pt',value:3},left:{unit:'pt',value:3},right:{unit:'pt',value:3}}},childIds:[id+'t']};d.nodes[id+'t']={id:id+'t',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:id+'leaf',type:'text',text:id==='b'?'one\ntwo':'header'}]};}
 return d;
}
async function run(d:any,box:any,bottom=500){
 const items:any[]=[];let page=0;
 const s:any={top:0,bottom,left:0,y:0,availableWidth:100,nextPage(){page++;this.y=0;},emitItem(i:any,x:number,y:number){items.push({id:i.nodeId,text:i.line?.run?.text,height:i.heightPt,x,y,page});},border(){}};
 const r:any={...fakeRuntime,spacingProbe:{nativeTableBox:(id:string)=>id==='table'?box:undefined,lineBox:()=>({heightPt:18.024,baselineOffsetPt:16})}};
 await cellTableFlow(d,d.nodes.table,r,s);return {s,items,r,page};
}
it('accounts a half-point border symmetrically in every native row including the header',async()=>{
 const d=fixture(),before=JSON.stringify(d),f=await run(d,{borderPt:.5});
 expect(f.items[0].y).toBeCloseTo(3.25);expect(f.items[1].y).toBeCloseTo(27.774);
 expect(f.s.y).toBeCloseTo(67.072);expect(JSON.stringify(d)).toBe(before);
 expect(await tableStartHeight(d,d.nodes.table,f.r)).toBeCloseTo(49.048);
});
it('quantizes each text line to native twips before summing a multiline cell',async()=>{
 const d=fixture(),f=await run(d,{borderPt:.5,quantizeTextToTwips:true});
 expect(f.items.map(i=>i.height)).toEqual([18,18,18]);expect(f.s.y).toBe(67);
 expect(await tableStartHeight(d,d.nodes.table,f.r)).toBe(49);
});
it('retains the prior geometry when no table is selected',async()=>{
 const f=await run(fixture(),undefined);expect(f.items[0].y).toBe(3);expect(f.s.y).toBeCloseTo(66.072);
});
it('flows long rows across repeated headers without losing a line',async()=>{
 const d=fixture();d.nodes.bt.children[0].text=Array.from({length:20},(_,i)=>'L'+i).join('\n');
 const f=await run(d,{borderPt:.5,quantizeTextToTwips:true},100);
 expect(f.items.filter(i=>i.id==='bt').map(i=>i.text)).toEqual(Array.from({length:20},(_,i)=>'L'+i));expect(f.page).toBeLessThan(10);
});
it('rejects invalid border reservations before emitting a table',async()=>{
 await expect(run(fixture(),{borderPt:-.5})).rejects.toThrow('native table');
});
