import {expect,it} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {mergedTemplate} from '../helpers/merged.js';
import {fonts,noImages,staged} from './helpers.js';
const pt=(value:number)=>({value,unit:'pt'});
const take=(r:any)=>{if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
async function exported(t:any){const v=take(api.validateTemplate(t)),d=take(api.composeDocument(v,take(api.prepareGeneration(v,{docKey:t.docKey,sections:{main:{data:{details:[{format:'merged',data:{}}]}}}})))),sink=staged();take(await take(await api.createDocxEngine(fonts())).generateDocxTo(d,noImages,sink.output));const z=await JSZip.loadAsync(Buffer.concat(sink.chunks));return z.file('word/document.xml')!.async('string');}
it.each(['dashed','dotted','double'])('serializes native %s borders/rules with common width and color',async kind=>{
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
