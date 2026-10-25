import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {measureText} from '../../src/layout/measureText.js';
import {cacheTextRuntime} from '../../src/runtime/cacheTextRuntime.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {cellTableFlow} from '../../src/layout/cellTableFlow.js';

it('keeps the default line layout unchanged and scopes the experimental baseline',async()=>{
 const d:any=document('A\nB'),style=d.styles.body;
 const normal=await measureText(d.nodes.t,style,100,fakeRuntime);
 const probe:any={...fakeRuntime,spacingProbe:{lineBox:(id:string)=>id==='t'?{heightPt:19.85,baselineOffsetPt:17.5}:undefined}};
 const lines=await measureText(d.nodes.t,style,100,probe);
 expect(normal[0]!.heightPt).toBe(18);expect(lines[0]!.heightPt).toBe(19.85);
 expect(lines[0]!.run!.baselineOffsetPt).toBe(17.5);
 const other=await measureText({...d.nodes.t,id:'other'},style,100,probe);
 expect(other.map(l=>[l.heightPt,l.run?.baselineOffsetPt])).toEqual(normal.map(l=>[l.heightPt,l.run?.baselineOffsetPt]));
});
it('preserves the probe through the per-render cache',async()=>{
 const d:any=document();const base:any={...fakeRuntime,spacingProbe:{lineBox:()=>({heightPt:20,baselineOffsetPt:16})}};
 const cached=cacheTextRuntime(base);expect((await measureText(d.nodes.t,d.styles.body,100,cached))[0]!.heightPt).toBe(20);cached.dispose();
});
it.each([NaN,-1])('rejects invalid experimental line metrics %s',async bad=>{
 const d:any=document();const runtime:any={...fakeRuntime,spacingProbe:{lineBox:()=>({heightPt:bad,baselineOffsetPt:16})}};
 await expect(measureText(d.nodes.t,d.styles.body,100,runtime)).rejects.toThrow();
});
it('scopes the body top to its section without changing the input',async()=>{
 const d=document();const before=JSON.stringify(d);const runtime:any={...fakeRuntime,spacingProbe:{bodyTopPt:(id:string)=>id==='main'?83:undefined}};
 const result=await documentFlow(d,runtime);expect(result.pages[0]!.commands[0]!.bounds.yPt).toBe(83);expect(JSON.stringify(d)).toBe(before);
});
it('charges one stroke per ordinary row without changing the default table',async()=>{
 const d:any=document();d.nodes={t:d.nodes.t,table:{id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{unit:'pt',value:100}}],rowIds:['r']},r:{id:'r',type:'table-row',props:{allowBreak:true},cellIds:['c']},c:{id:'c',type:'table-cell',props:{padding:{top:{unit:'pt',value:3},bottom:{unit:'pt',value:3},left:{unit:'pt',value:3},right:{unit:'pt',value:3}}},childIds:['t']}};
 const run=async(runtime:any)=>{const sink={top:0,bottom:200,left:0,availableWidth:100,y:0,nextPage(){throw Error('unexpected page');},emitItem(){},border(){}};await cellTableFlow(d,d.nodes.table,runtime,sink);return sink.y;};
 expect(await run(fakeRuntime)).toBe(24);expect(await run({...fakeRuntime,spacingProbe:{rowStrokePt:()=>.5}})).toBe(24.5);
});

function consecutiveTables(){
 const d:any=document();d.rootIds.splice(0,d.rootIds.length,'a','b');
 for(const id of ['a','b']){
  d.nodes[id]={id,type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{unit:'pt',value:100}}],rowIds:[id+'r']};
  d.nodes[id+'r']={id:id+'r',type:'table-row',props:{allowBreak:true},cellIds:[id+'c']};
  d.nodes[id+'c']={id:id+'c',type:'table-cell',props:{padding:{top:{unit:'pt',value:0},bottom:{unit:'pt',value:0},left:{unit:'pt',value:0},right:{unit:'pt',value:0}}},childIds:[id+'t']};
  d.nodes[id+'t']={...d.nodes.t,id:id+'t',children:[{id:id+'leaf',type:'text',text:id}]};
 }
 return d;
}
it('charges a scoped boundary once between consecutive tables',async()=>{
 const d=consecutiveTables();const runtime:any={...fakeRuntime,spacingProbe:{tableBoundaryPt:(a:string,b:string)=>a==='a'&&b==='b'?1.5:undefined}};
 const normal=await documentFlow(d,fakeRuntime),probe=await documentFlow(d,runtime);
 expect(probe.pages[0]!.commands[1]!.bounds.yPt-normal.pages[0]!.commands[1]!.bounds.yPt).toBeCloseTo(1.5);
 expect(probe.pages[0]!.commands[0]).toEqual(normal.pages[0]!.commands[0]);
});
it('does not carry a table boundary into a new page',async()=>{
 const d=consecutiveTables();d.book.page.margin.bottom={unit:'pt',value:297*72/25.4-20*72/25.4-37};
 const runtime:any={...fakeRuntime,spacingProbe:{tableBoundaryPt:()=>1.5}};
 const flow=await documentFlow(d,runtime);expect(flow.pages).toHaveLength(2);
 expect(flow.pages[1]!.commands[0]!.bounds.yPt).toBeCloseTo(20*72/25.4);
});
it('does not apply a table boundary across an intervening paragraph',async()=>{
 const d=consecutiveTables();d.rootIds.splice(1,0,'t');const runtime:any={...fakeRuntime,spacingProbe:{tableBoundaryPt:()=>1.5}};
 expect(await documentFlow(d,runtime)).toEqual(await documentFlow(d,fakeRuntime));
});
it('rejects a negative boundary measurement',async()=>{
 const runtime:any={...fakeRuntime,spacingProbe:{tableBoundaryPt:()=>-1}};
 await expect(documentFlow(consecutiveTables(),runtime)).rejects.toThrow('boundary');
});
