import {it,expect} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {document} from '../helpers/document.js';
import {fonts,noImages,staged} from './helpers.js';
function fixture(uniform=false):any {
 const d:any=document();d.rootIds=['table'];d.sections[0].rootIds=d.rootIds;d.nodes={};d.sourceMap={};d.styles.body.lineHeightPt=20;
 d.nodes.table={id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true},columns:[{width:{value:200,unit:'pt'}},{width:{value:200,unit:'pt'}}],rowIds:['row']};
 d.nodes.row={id:'row',type:'table-row',props:{allowBreak:false},cellIds:['a','b']};
 for(const [i,id]of ['a','b'].entries()){
  d.nodes[id]={id,type:'table-cell',props:{padding:{top:{unit:'pt',value:i&&!uniform?35.45:5.3},bottom:{unit:'pt',value:i&&!uniform?40.05:3.3},left:{unit:'pt',value:4},right:{unit:'pt',value:4}}},childIds:[id+'1',id+'2']};
  for(const n of [1,2])d.nodes[id+n]={id:id+n,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:id+n+'-leaf',type:'text',text:id+n}]};
 }
 for(const n of Object.values(d.nodes) as any[])for(const id of [n.id,...(n.children??[]).map((c:any)=>c.id)])d.sourceMap[id]={origin:'authored',sectionId:'main',sourceId:id};return d;
}
async function exported(d:any){const before=JSON.stringify(d),e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const sink=staged(),r=await e.value.generateDocxTo(d,noImages,sink.output,{textLayout:'native'});if(!r.ok)throw Error(JSON.stringify(r));expect(JSON.stringify(d)).toBe(before);const z=await JSZip.loadAsync(Buffer.concat(sink.chunks));return {xml:await z.file('word/document.xml')!.async('string'),receipt:r.value,zip:z};}
it('moves unequal vertical margins into first/last paragraph offsets without changing line height',async()=>{
 const {xml,receipt}=await exported(fixture()),cells=xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!;
 for(const c of cells){expect(c).toContain('<w:top w:type="dxa" w:w="106"/>');expect(c).toContain('<w:bottom w:type="dxa" w:w="66"/>');expect(c).toContain('<w:left w:type="dxa" w:w="80"/>');}
 const ps=cells[1].match(/<w:p>[\s\S]*?<\/w:p>/g)!;
 expect(ps[0]).toContain('w:before="603"');expect(ps[0]).toContain('w:after="0"');expect(ps[1]).toContain('w:before="0"');expect(ps[1]).toContain('w:after="735"');
 expect((xml.match(/w:line="400" w:lineRule="atLeast"/g)??[])).toHaveLength(4);expect(xml).toContain('<w:cantSplit/>');expect(xml).toContain('<w:tblHeader/>');
 expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',verticalOffsetPolicy:'row-minimum-margins-and-paragraph-offsets'}));
});
it('retains uniform margins without inventing offsets',async()=>{
 const {xml,receipt}=await exported(fixture(true));expect(xml).not.toContain('w:before="603"');expect(xml).not.toContain('w:after="735"');
 expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',verticalOffsetPolicy:'retain-native'}));
});
it('retains native margins for a row containing an empty cell',async()=>{
 const d=fixture();for(const id of ['a1','a2']){delete d.sourceMap[id+'-leaf'];delete d.sourceMap[id];delete d.nodes[id];}d.nodes.a.childIds=[];
 const {xml}=await exported(d);expect(xml).toContain('<w:top w:type="dxa" w:w="709"/>');expect(xml).toContain('<w:bottom w:type="dxa" w:w="801"/>');expect(xml).not.toContain('w:before="603"');
});
it('protects a final Area even when its signing table has unequal cell margins',async()=>{
 const d=fixture();for(const value of Object.values(d.sourceMap) as any[])Object.assign(value,{areaId:'signing',areaEntryIndex:0,areaFormatId:'sign-format'});
 d.sections[0].endingArea={areaId:'signing',verticalAlign:'bottom',rootStartIndex:0,rootIds:['table']};
 const {zip,receipt}=await exported(d),xml=await zip.file('word/footnotes.xml')!.async('string');
 expect(xml).toContain('<w:top w:type="dxa" w:w="709"/>');expect(xml).toContain('<w:bottom w:type="dxa" w:w="801"/>');expect(xml).not.toContain('w:before="603"');
 expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',verticalOffsetPolicy:'retain-native'}));
});
