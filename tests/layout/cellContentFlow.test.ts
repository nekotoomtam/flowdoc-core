import {it,expect,vi} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import * as grid from '../../src/composition/tableGrid.js';
import {mergedDoc} from '../helpers/merged.js';
export function cellDoc():any{
 const d:any=document();d.nodeModelVersion=9;d.rootIds=['table'];d.sourceMap={table:{contentIndex:0,format:'cell',sourceId:'table'}};
 d.nodes={table:{id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:200,unit:'pt'}}],rowIds:['row']},row:{id:'row',type:'table-row',props:{allowBreak:true},cellIds:['cell']},cell:{id:'cell',type:'table-cell',props:{},childIds:['t','pic','caption']},t:d.nodes.t,pic:{id:'pic',type:'image',props:{width:{value:100,unit:'pt'},height:{value:80,unit:'pt'},resourceId:'p',align:'center'}},caption:{id:'caption',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'caption-leaf',type:'text',text:'caption'}]}};return d;
}
export const images:any={p:{format:'rgb',width:2,height:1,pixels:new Uint8Array(6)}};
it('lays out text image caption with default padding and contain geometry without mutating input',async()=>{
 const d=cellDoc(),before=structuredClone(d),r=await documentFlow(d,fakeRuntime,images),p=r.pages[0]!;
 const a=p.commands.find(x=>x.nodeId==='t')!,b=p.commands.find(x=>x.nodeId==='caption')!,img=p.images![0]!;
 expect(b.bounds.yPt-a.bounds.yPt).toBe(98);expect(img.heightPt).toBe(50);expect(img.yPt-a.bounds.yPt).toBeCloseTo(33);
 expect(img.xPt-a.bounds.xPt).toBeCloseTo(46);expect(d).toEqual(before);
});
it.each(['left','center','right'])('positions %s frame within content width with zero and mixed units',async align=>{
 const d=cellDoc();d.nodes.pic.props.align=align;d.nodes.cell.props.padding={top:{value:0,unit:'pt'},bottom:{value:0,unit:'pt'},left:{value:0,unit:'pt'},right:{value:2,unit:'mm'}};
 const r=await documentFlow(d,fakeRuntime,images),p=r.pages[0]!,left=20*72/25.4;
 expect(p.commands[0]!.bounds.yPt).toBeCloseTo(left);expect(p.commands[0]!.bounds.xPt).toBeCloseTo(left);
 expect(p.images![0]!.xPt).toBeCloseTo(left+(align==='left'?0:align==='center'?(100-2*72/25.4)/2:100-2*72/25.4));
});
it('preserves missing image frame space',async()=>{const d=cellDoc(),r=await documentFlow(d,fakeRuntime);expect(r.pages[0]!.images??[]).toEqual([]);expect(r.pages[0]!.commands[1]!.bounds.yPt-r.pages[0]!.commands[0]!.bounds.yPt).toBe(98);});
it('moves an image whole and keeps following caption after it',async()=>{
 const d=cellDoc();d.nodes.t.children[0].text=Array(37).fill('line').join('\n');
 const r=await documentFlow(d,fakeRuntime,images);expect(r.pages).toHaveLength(2);
 expect(r.pages[0]!.images??[]).toHaveLength(0);expect(r.pages[1]!.images).toHaveLength(1);
 expect(r.pages[1]!.commands.some(c=>c.nodeId==='caption')).toBe(true);
});
it.each(['wide','tall','padding'])('rejects impossible %s',kind=>{const d=cellDoc();if(kind==='wide')d.nodes.pic.props.width.value=201;if(kind==='tall')d.nodes.pic.props.height.value=1000;if(kind==='padding')d.nodes.cell.props.padding={left:{value:200,unit:'pt'}};return expect(documentFlow(d,fakeRuntime,images)).rejects.toThrow();});
it('prepares each table once per layout pass despite multiple pages and repeated headers',async()=>{
 const d=mergedDoc(95);d.nodeModelVersion=9;const spy=vi.spyOn(grid,'resolveTableGrid');
 try{const r=await documentFlow(d,fakeRuntime);expect(r.pages.length).toBeGreaterThan(2);expect(spy).toHaveBeenCalledTimes(1);}finally{spy.mockRestore();}
});
it('supports fully empty zero-padding cells without stalling',async()=>{const d=cellDoc();d.nodes.cell.childIds=[];d.nodes.cell.props.padding=Object.fromEntries(['top','right','bottom','left'].map(s=>[s,{value:0,unit:'pt'}]));const r=await documentFlow(d,fakeRuntime);expect(r.pages).toHaveLength(1);});
