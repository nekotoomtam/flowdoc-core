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
