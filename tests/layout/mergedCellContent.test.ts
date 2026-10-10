import {it,expect,vi} from 'vitest';
import {mergedDoc} from '../helpers/merged.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import * as grid from '../../src/composition/tableGrid.js';
import * as measurement from '../../src/layout/measureCellContent.js';
const images:any={p:{format:'rgb',width:2,height:1,pixels:new Uint8Array(6)}};
function mixed(lines=80):any{
 const d=mergedDoc(lines);d.nodeModelVersion=9;
 for(const cid of ['a','h']){const id=cid+'-image';d.nodes[id]={id,type:'image',props:{width:{value:100,unit:'pt'},height:{value:60,unit:'pt'},resourceId:'p'}};d.nodes[cid].childIds.push(id);}
 return d;
}
it.each([0,4,11])('keeps merged content, frame padding and header images at padding %s',async pad=>{
 const d=mixed();for(const n of Object.values(d.nodes) as any[])if(n.type==='table-cell')n.props.padding=Object.fromEntries(['top','bottom','left','right'].map(k=>[k,{value:pad,unit:'pt'}]));
 const r=await documentFlow(d,fakeRuntime,images);expect(r.pages.length).toBeGreaterThan(2);
 expect(r.pages.flatMap(p=>p.images??[]).filter(i=>i.nodeId==='a-image')).toHaveLength(1);
 expect(r.pages.flatMap(p=>p.commands).filter(c=>c.nodeId==='at').map(c=>c.text)).toEqual(Array.from({length:80},(_,i)=>'A'+i));
 for(const p of r.pages){expect(p.images!.filter(i=>i.nodeId==='h-image')).toHaveLength(1);
  for(const c of p.commands)expect(c.bounds.yPt+c.bounds.heightPt).toBeLessThanOrEqual(p.heightPt-20*72/25.4-pad+1e-5);
  for(const i of p.images??[])expect(i.yPt+i.heightPt).toBeLessThanOrEqual(p.heightPt-20*72/25.4-pad+1e-5);
 }
});
it('measures owner cells once and never repeats preparation on continuation pages',async()=>{
 const d=mixed(),g=vi.spyOn(grid,'resolveTableGrid'),m=vi.spyOn(measurement,'measureCellContent');
 try{await documentFlow(d,fakeRuntime,images);expect(g).toHaveBeenCalledTimes(1);expect(m).toHaveBeenCalledTimes(5);}finally{g.mockRestore();m.mockRestore();}
});
it('prepares two independent instances without sharing their geometry',async()=>{
 const d=mixed(5),other=mixed(9);const rename=(v:any):any=>typeof v==='string'&&Object.hasOwn(other.nodes,v)?'second-'+v:Array.isArray(v)?v.map(rename):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,k==='type'?x:rename(x)])):v;
 for(const [id,n] of Object.entries(other.nodes))d.nodes['second-'+id]=rename(n);d.rootIds.push('second-table');
 const spy=vi.spyOn(grid,'resolveTableGrid');try{const r=await documentFlow(d,fakeRuntime,images);expect(spy).toHaveBeenCalledTimes(2);expect(r.pages.flatMap(p=>p.commands).filter(c=>c.nodeId==='second-at')).toHaveLength(9);}finally{spy.mockRestore();}
});
it('rejects an indivisible image taller than a fresh page after header reservation',async()=>{const d=mixed();d.nodes['a-image'].props.height.value=700;await expect(documentFlow(d,fakeRuntime,images)).rejects.toThrow(/fit|page/i);});
it('keeps protected rows intact',async()=>{const d=mixed(95);d.nodes.r2.props.allowBreak=false;await expect(documentFlow(d,fakeRuntime,images)).rejects.toThrow(/row/i);});
