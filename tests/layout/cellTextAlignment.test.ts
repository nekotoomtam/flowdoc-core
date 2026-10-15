import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {mergedTemplate} from '../helpers/merged.js';
import {measureCellContent} from '../../src/layout/measureCellContent.js';
import {validateTemplate} from '../../src/template/validateTemplate.js';
it.each(['center','right'] as const)('aligns every wrapped cell line %s by actual ink width',async align=>{
 const d:any=document();d.nodes.t.props.textAlign=align;d.nodes.t.children=[{id:'txt',type:'text',text:'ABCD\nAB'}];
 const items=await measureCellContent(d,['t'],100,fakeRuntime);
 expect(items).toHaveLength(2);
 for(const item of items){if(item.kind!=='text-line')throw Error();const line=item.line;expect(line.run!.bounds.xPt).toBeCloseTo((100-line.occupiedWidthPt!)/(align==='center'?2:1));}
});
it('admits alignment only for supported cell text, rejecting invalid values',()=>{
 const t=mergedTemplate();t.nodeModelVersion=18;const n=t.areaFormats.merged.fragment.nodes;
 n.at.props.textAlign='center';expect(validateTemplate(t).ok).toBe(true);
 n.at.props.textAlign='justify';expect(validateTemplate(t).ok).toBe(false);
 n.at.props.textAlign='right';expect(validateTemplate(t).ok).toBe(true);
});
it('keeps empty text height, negative bearings and link spans',async()=>{
 const d:any=document();d.nodes.t.props.textAlign='center';d.nodes.t.children=[{id:'l',type:'link',text:'ABC',url:'https://example.com'}];
 const runtime={...fakeRuntime,async shape(t:string){return {...await fakeRuntime.shape(t),inkLeftPt:-2,inkRightPt:20};}};
 const items=await measureCellContent(d,['t'],100,runtime);const line=(items[0] as any).line;
 expect(line.run.bounds.xPt).toBe(41);expect(line.run.links[0].link.url).toBe('https://example.com');
 d.nodes.t.children=[];const empty=await measureCellContent(d,['t'],100,runtime);expect(empty[0]!.heightPt).toBe(d.styles.body.lineHeightPt);
});
it('retains centered lines across merged cells and page continuation',async()=>{
 const {mergedDoc}=await import('../helpers/merged.js');const {cellTableFlow}=await import('../../src/layout/cellTableFlow.js');
 const d:any=mergedDoc(95);d.nodeModelVersion=18;for(const n of Object.values(d.nodes) as any[])if(n.type==='text-block')n.props.textAlign='center';
 let pages=1,lines=0;
 const sink={top:0,bottom:150,left:10,availableWidth:500,y:0,nextPage(){pages++;this.y=0;},emitItem(item:any,x:number,y:number,width:number){if(item.kind!=='text-line'||!item.line.run)return;lines++;const l=item.line;expect(l.run.bounds.xPt+l.occupiedWidthPt/2).toBeCloseTo(width/2);},border(){}};
 await cellTableFlow(d,d.nodes.table,fakeRuntime,sink);expect(pages).toBeGreaterThan(1);expect(lines).toBeGreaterThan(95);
});
