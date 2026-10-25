import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
function fixture(count=6){
 const d=document(Array.from({length:count},(_,i)=>'L'+i).join('\n'));
 d.book.page.margin.top={unit:'pt',value:0};d.book.page.margin.bottom={unit:'pt',value:297*72/25.4-108};
 return d;
}
const runtime=(bottom:number,id='main'):any=>({...fakeRuntime,spacingProbe:{bodyBottomPt:(section:string)=>section===id?bottom:undefined}});
it('uses the native body boundary for line capacity without changing source or line metrics',async()=>{
 const d=fixture(),saved=JSON.stringify(d),before=await documentFlow(d,fakeRuntime),after=await documentFlow(d,runtime(90));
 expect(before.pages).toHaveLength(1);expect(after.pages).toHaveLength(2);expect(after.pages.map(p=>p.commands.length)).toEqual([5,1]);
 expect(after.pages.flatMap(p=>p.commands).map(r=>r.text)).toEqual(before.pages[0]!.commands.map(r=>r.text));expect(JSON.stringify(d)).toBe(saved);
});
it('allows a line ending exactly on the body boundary',async()=>{expect((await documentFlow(fixture(5),runtime(90))).pages).toHaveLength(1);});
it('does not expand the normal body or affect unselected sections',async()=>{
 const d=fixture(),base=await documentFlow(d,fakeRuntime);expect(await documentFlow(d,runtime(500))).toEqual(base);expect(await documentFlow(d,runtime(90,'other'))).toEqual(base);
});
it.each([NaN,Infinity,-1,0,900])('rejects an invalid body bottom %s before page flow',async value=>{await expect(documentFlow(fixture(),runtime(value))).rejects.toThrow('body bottom');});
it('moves heading and table start together using the reduced capacity',async()=>{
 const d:any=fixture(3);d.rootIds.splice(1,0,'heading','table');d.nodes.heading={...d.nodes.t,id:'heading',props:{textStyleId:'body',toc:{level:1}},children:[{id:'headingLeaf',type:'text',text:'Heading'}]};
 d.nodes.table={id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true},columns:[{width:{unit:'pt',value:100}}],rowIds:['h','b']};
 for(const id of ['h','b']){d.nodes[id]={id,type:'table-row',props:{allowBreak:true},cellIds:[id+'c']};d.nodes[id+'c']={id:id+'c',type:'table-cell',props:{padding:{top:{unit:'pt',value:0},bottom:{unit:'pt',value:0}}},childIds:[id+'t']};d.nodes[id+'t']={...d.nodes.t,id:id+'t',children:[{id:id+'leaf',type:'text',text:id}]};}
 const r=runtime(90);r.spacingProbe.keepTableStart=()=>true;const f=await documentFlow(d,r),page=(id:string)=>f.pages.findIndex(p=>p.commands.some(c=>c.nodeId===id));
 expect(page('heading')).toBe(1);expect(page('ht')).toBe(1);expect(page('bt')).toBe(1);
});
