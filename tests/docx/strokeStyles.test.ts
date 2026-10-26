import {expect,it} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {mergedTemplate} from '../helpers/merged.js';
import {fonts,noImages,staged} from './helpers.js';
const pt=(value:number)=>({value,unit:'pt'});
const take=(r:any)=>{if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
async function exported(t:any){const v=take(api.validateTemplate(t)),d=take(api.composeDocument(v,take(api.prepareGeneration(v,{docKey:t.docKey,sections:{main:{data:{details:[{format:'merged',data:{}}]}}}})))),sink=staged();take(await take(await api.createDocxEngine(fonts())).generateDocxTo(d,noImages,sink.output));const z=await JSZip.loadAsync(Buffer.concat(sink.chunks));return z.file('word/document.xml')!.async('string');}
it('rejects B merged grids without committing output instead of silently drawing wrong row outlines',async()=>{
 const t=mergedTemplate();Object.assign(t.areaFormats.merged.fragment.nodes.table.props,{borderStyle:'thickThinWideGap',borderWidth:pt(.35)});
 const v=take(api.validateTemplate(t)),d=take(api.composeDocument(v,take(api.prepareGeneration(v,{docKey:t.docKey,sections:{main:{data:{details:[{format:'merged',data:{}}]}}}})))),sink=staged();
 const r=await take(await api.createDocxEngine(fonts())).generateDocxTo(d,noImages,sink.output);
 expect(r.ok).toBe(false);if(!r.ok)expect(r.issues[0]?.code).toBe('DOCX_CAPABILITY_UNSUPPORTED');expect(sink.chunks).toHaveLength(0);
});
it.each(['dashed','dotted','double','dashSmallGap'])('serializes native %s borders/rules with common width and color',async kind=>{
 const t=mergedTemplate(),f=t.areaFormats.merged;Object.assign(f.fragment.nodes.table.props,{borderStyle:kind,borderWidth:pt(.75),borderColor:'224466'});
 f.fragment.nodes.rule={id:'rule',type:'line',props:{lineStyle:kind,thickness:pt(.75),color:'224466'}};f.fragment.rootIds.push('rule');
 const xml=await exported(t);expect(xml).toContain(`w:val="${kind}" w:color="224466" w:sz="6"`);expect(xml).not.toContain('w:sz="4"');
});
it('maps explicit merged-cell perimeters to independent table sides and header seam',async()=>{
 const t=mergedTemplate();t.areaFormats.merged.fragment.nodes.table.props.borders={top:{style:'none'},left:{style:'none'},right:{style:'double',width:pt(1),color:'112233'},bottom:{style:'dashed',width:pt(.75)},insideHorizontal:{style:'none'},insideVertical:{style:'dotted',width:pt(.5)},headerBottom:{style:'single',width:pt(1),color:'123456'}};
 const xml=await exported(t);expect(xml).toContain('<w:right w:val="double" w:color="112233" w:sz="8"/>');expect(xml).toContain('<w:insideH w:val="none"');expect(xml).toContain('<w:insideV w:val="dotted"');expect(xml).toContain('<w:bottom w:val="single" w:color="123456" w:sz="8"/>');expect(xml).toContain('<w:vMerge w:val="continue"/>');
});

function ordinaryTemplate(){
 const t=mergedTemplate(),nodes=t.areaFormats.merged.fragment.nodes;
 for(const [row,rid] of ['header','r1','r2'].entries()){
  nodes[rid].cellIds=[];
  for(let col=0;col<3;col++){
   const id=`plain${row}${col}`;nodes[rid].cellIds.push(id);
   nodes[id]={id,type:'table-cell',props:{columnIndex:col},childIds:[id+'t']};
   nodes[id+'t']={id:id+'t',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:id+'leaf',type:'text',text:id}]};
  }
 }
 for(const id of ['h','a','b','c','e']){delete nodes[id];delete nodes[id+'t'];}
 return t;
}
it('emits B drawings from an ordinary table while preserving native rows and paragraph flow',async()=>{
 const t=ordinaryTemplate(),nodes=t.areaFormats.merged.fragment.nodes;Object.assign(nodes.table.props,{borderStyle:'thickThinWideGap',borderWidth:pt(.35),borders:{insideHorizontal:{style:'none'}}});
 for(const n of Object.values(nodes)as any[])if(n.type==='text-block')n.children[0].text='X';
 nodes.plain00t.children.push({id:'header-break',type:'line-break'},{id:'header-second',type:'text',text:'Y'});
 const xml=await exported(t);expect(xml).not.toContain('<undefined>');expect(xml).toMatch(/<w:r><w:drawing[ >]/);expect(xml.match(/<wp:anchor /g)).toHaveLength(3);expect(xml).toContain('cmpd="thickThin"');expect(xml).toContain('w="4445"');expect(xml).toContain('d="400000" sp="1200000"');expect(xml).not.toContain('w:trHeight');expect(xml).not.toContain('w:type="page"');expect(xml).not.toMatch(/w:val="(?:single|thickThinWideGap)"/);expect(xml.match(/>X<\/w:t>/g)).toHaveLength(9);
});
it('rejects a multiline body under B without changing it to a fixed-height row',async()=>{
 const t=ordinaryTemplate(),ns=t.areaFormats.merged.fragment.nodes;Object.assign(ns.table.props,{borderStyle:'thickThinWideGap',borderWidth:pt(.35)});ns.plain10t.children[0].text='one\ntwo';
 await expect(exported(t)).rejects.toThrow('DOCX_CAPABILITY_UNSUPPORTED');
});
it('derives B header extent from the font typo line metrics instead of its larger ink safety bounds',async()=>{
 const t=ordinaryTemplate(),ns=t.areaFormats.merged.fragment.nodes;Object.assign(t.styles.body,{fontSize:pt(7.85),lineHeightPt:10});Object.assign(ns.table.props,{borderStyle:'thickThinWideGap',borderWidth:pt(.35)});
 for(const n of Object.values(ns)as any[])if(n.type==='text-block')n.children[0].text='X';
 ns.plain00t.children.push({id:'hbreak',type:'line-break'},{id:'hsecond',type:'text',text:'Y'});
 const xml=await exported(t),heights=[...xml.matchAll(/<wp:extent[^>]*cy="(\d+)"/g)].map(v=>Number(v[1]));expect(heights).toEqual([365760,233680,233680]);
});
it('anchors B to grid column zero when explicitly indexed source cells are reordered',async()=>{
 const t=ordinaryTemplate(),ns=t.areaFormats.merged.fragment.nodes;Object.assign(ns.table.props,{borderStyle:'thickThinWideGap',borderWidth:pt(.35)});
 for(const n of Object.values(ns)as any[])if(n.type==='text-block')n.children[0].text='X';
 ns.plain00.props.padding={left:pt(1),right:pt(1),top:pt(3),bottom:pt(3)};ns.plain01.props.padding={left:pt(10),right:pt(1),top:pt(8),bottom:pt(3)};ns.header.cellIds=['plain01','plain00','plain02'];
 const xml=await exported(t),first=xml.match(/<wp:anchor[^]*?<\/wp:anchor>/)![0];expect(first).toContain('<wp:positionH relativeFrom="column"><wp:posOffset>-12700</wp:posOffset>');expect(first).toContain('<wp:positionV relativeFrom="paragraph"><wp:posOffset>-38100</wp:posOffset>');
});
it('rejects a B body row whose insets exceed section capacity before output',async()=>{
 const t=ordinaryTemplate(),ns=t.areaFormats.merged.fragment.nodes;Object.assign(ns.table.props,{borderStyle:'thickThinWideGap',borderWidth:pt(.35)});
 for(const n of Object.values(ns)as any[])if(n.type==='text-block')n.children[0].text='X';
 ns.plain10.props.padding={top:pt(800),bottom:pt(800),left:pt(4),right:pt(4)};
 await expect(exported(t)).rejects.toThrow('DOCX_CAPABILITY_UNSUPPORTED');
});
it('lets ordinary open body rows inherit the table outline without suppressing continuation borders',async()=>{
 const t=ordinaryTemplate();t.areaFormats.merged.fragment.nodes.table.props.borders={bottom:{style:'dotted'},insideHorizontal:{style:'none'},headerBottom:{style:'single'}};
 const xml=await exported(t),cells=xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!;
 expect(cells).toHaveLength(9);expect(xml).toContain('<w:insideH w:val="none"');
 for(const c of cells.slice(3,6)){const b=c.match(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/)![0];expect(b).not.toContain('<w:bottom');expect(b).toContain('<w:top w:val="single"');}
 for(const c of cells.slice(6)){const b=c.match(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/)![0];expect(b).not.toContain('<w:top');expect(b).toContain('<w:bottom w:val="dotted"');}
 for(const c of cells.slice(0,3))expect(c).toContain('<w:bottom w:val="single"');
});
it('retains explicit cell edges when the ordinary table outline is hidden',async()=>{
 const t=ordinaryTemplate();t.areaFormats.merged.fragment.nodes.table.props.borders={bottom:{style:'none'},insideHorizontal:{style:'none'}};
 const xml=await exported(t);for(const c of xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!)expect(c).toContain('<w:bottom w:val="none"');
});
