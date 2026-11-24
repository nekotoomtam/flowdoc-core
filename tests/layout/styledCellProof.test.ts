import {expect,it} from 'vitest';
import {measureStyledCell} from '../../src/layout/measureStyledCell.js';
import {document,fakeRuntime} from '../helpers/document.js';

it('places differently styled cell inlines on one baseline and keeps both texts',async()=>{
 const d=document('ป้าย ');
 const node=d.nodes.t!;
 d.styles.label={...d.styles.body!,fontSize:{unit:'pt',value:18}};
 node.children=[{id:'label',type:'text',text:'ป้าย ',textStyleId:'label'},{id:'value',type:'text',text:'ห้อง'}];
 const [line]=await measureStyledCell(node,d.styles,300,fakeRuntime);
 expect(line!.runs!.map(run=>run.text)).toEqual(['ป้าย ','ห้อง']);
 expect(line!.runs![1]!.bounds.xPt).toBeGreaterThan(line!.runs![0]!.bounds.xPt);
 expect(line!.runs![0]!.baselineOffsetPt).toBe(line!.runs![1]!.baselineOffsetPt);
});

it.each([16,18])('inherits size from a %i pt parent and clears only the selected override',async size=>{
 const d=document('');const node=d.nodes.t!;
 d.styles.body={...d.styles.body!,fontSize:{unit:'pt',value:size}};
 node.children=[
  {id:'a',type:'text',text:'A',styleOverride:{bold:true}},
  {id:'b',type:'text',text:'B',styleOverride:{bold:true,fontSizePt:22}},
  {id:'c',type:'text',text:'C'},
 ];
 const [line]=await measureStyledCell(node,d.styles,300,fakeRuntime);
 expect(line!.runs!.map(run=>[run.fontSizePt,run.fontId])).toEqual([[size,'font-bold'],[22,'font-bold'],[size,'font-regular']]);
});

it('keeps paint and italic selection local to each run',async()=>{
 const d=document('');const node=d.nodes.t!;
 node.children=[{id:'a',type:'text',text:'A',styleOverride:{italic:true,color:'0066cc',underline:true}},
                {id:'b',type:'text',text:'B'}];
 const [line]=await measureStyledCell(node,d.styles,300,fakeRuntime);
 expect(line!.runs!.map(r=>[r.fontId,r.color,!!r.underline])).toEqual([
  ['font-italic','0066CC',true],['font-regular','000000',false],
 ]);
});
