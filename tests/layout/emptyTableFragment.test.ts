import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {cellTableFlow} from '../../src/layout/cellTableFlow.js';
async function trial(empty=false){
 const d:any=document('first');d.nodeModelVersion=18;
 d.nodes.second={...structuredClone(d.nodes.t),id:'second'};d.nodes.second.children[0].text='second';
 d.nodes.table={id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:100,unit:'pt'}}],rowIds:['r1','r2']};
 for(const [r,c,t] of [['r1','c1','t'],['r2','c2','second']]){d.nodes[r]={id:r,type:'table-row',props:{allowBreak:true},cellIds:[c]};d.nodes[c]={id:c,type:'table-cell',props:{fillColor:'EEEEEE'},childIds:empty&&r==='r2'?[]:[t]};}
 let page=0;const borders:number[][]=[],fills:number[][]=[],items:string[][]=[];
 const sink={top:0,bottom:40,left:0,availableWidth:100,y:0,nextPage(){page++;this.y=0;},emitItem(item:any){(items[page]??=[]).push(item.nodeId);},border(x1:number,y1:number,x2:number,y2:number){(borders[page]??=[]).push(Math.max(y1,y2));},fill(x:number,y:number,w:number,h:number){(fills[page]??=[]).push(y+h);}};
 await cellTableFlow(d,d.nodes.table,fakeRuntime,sink);return {borders,fills,items};
}
it('omits empty trailing row fragment without moving its next-page content',async()=>{const r=await trial();expect(r.items).toEqual([['t'],['second']]);expect(Math.max(...r.borders[0]!)).toBe(26);expect(Math.max(...r.fills[0]!)).toBe(26);});
it('preserves an explicitly authored empty row',async()=>{const r=await trial(true);expect(Math.max(...r.borders[0]!)).toBe(34);expect(Math.max(...r.fills[0]!)).toBe(34);});
