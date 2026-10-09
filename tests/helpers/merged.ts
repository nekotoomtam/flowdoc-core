import {document} from './document.js';
export function mergedDoc(lines=3):any{
 const d:any=document();d.nodeModelVersion=6;d.nodes={};d.rootIds=['table'];d.sourceMap={table:{contentIndex:0,format:'merged',sourceId:'table'}};
 d.nodes.table={id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true},columns:[0,1,2].map(()=>({width:{value:140,unit:'pt'}})),rowIds:['header','r1','r2']};
 const row=(id:string,cells:string[])=>d.nodes[id]={id,type:'table-row',props:{allowBreak:true},cellIds:cells};
 const cell=(id:string,columnIndex:number,text:string,props={})=>{d.nodes[id]={id,type:'table-cell',props:{columnIndex,...props},childIds:[id+'t']};d.nodes[id+'t']={id:id+'t',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:id+'leaf',type:'text',text}]};};
 row('header',['h']);cell('h',0,'HEADER',{colSpan:3});row('r1',['a','b']);cell('a',0,Array.from({length:lines},(_,i)=>'A'+i).join('\n'),{rowSpan:2});cell('b',1,'B',{colSpan:2});row('r2',['c','e']);cell('c',1,'C');cell('e',2,'E');return d;
}
export function mergedTemplate():any{const d=mergedDoc();return {schemaVersion:1,nodeModelVersion:6,templateId:'merged',docKey:'merged',version:1,name:'Merged',book:d.book,styles:d.styles,globalSchema:{type:'object',fields:{}},formats:{merged:{inputSchema:{type:'object',fields:{}},fragment:{rootIds:d.rootIds,nodes:d.nodes},repeats:[]}},examples:[]};}
