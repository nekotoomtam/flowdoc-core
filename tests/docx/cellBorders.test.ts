import {expect,it} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {mergedTemplate} from '../helpers/merged.js';
import {groupLabelTemplate,groupLabelRequest} from '../helpers/groupLabels.js';
import {fonts,noImages,staged} from './helpers.js';
function take<T>(r:api.Result<T>):T{if(!r.ok)throw Error(JSON.stringify(r));return r.value;}
async function exported(t:any,q:any){
 const v=take(api.validateTemplate(t)),d=take(api.composeDocument(v,take(api.prepareGeneration(v,q)))),before=JSON.stringify(d),sink=staged();
 const r=take(await take(await api.createDocxEngine(fonts())).generateDocxTo(d,noImages,sink.output));
 expect(JSON.stringify(d)).toBe(before);const z=await JSZip.loadAsync(Buffer.concat(sink.chunks));
 return {xml:await z.file('word/document.xml')!.async('string'),receipt:r};
}
const borders=(cell:string)=>cell.match(/<w:tcBorders>[\s\S]*?<\/w:tcBorders>/)?.[0]??'';
const single=(edge:string)=>`<w:${edge} w:val="single" w:color="345678" w:sz="4"/>`;
it('sets explicit cell perimeters, preserving horizontal spans and suppressing internal vertical-merge edges',async()=>{
 const t=mergedTemplate();t.areaFormats.merged.fragment.nodes.table.props.borderColor='345678';
 t.areaFormats.merged.fragment.nodes.h.props.fillColor='CBEDFA';
 const {xml,receipt}=await exported(t,{docKey:t.docKey,data:{},sections:{main:{data:{details:[{format:'merged',data:{}}]}}}});
 const cells=xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[];expect(cells).toHaveLength(6);
 for(const cell of cells){expect(borders(cell)).toContain(single('left'));expect(borders(cell)).toContain(single('right'));}
 for(const i of [0,2,4,5])for(const edge of ['top','bottom'])expect(borders(cells[i]!)).toContain(single(edge));
 expect(cells[0]).toContain('<w:gridSpan w:val="3"/>');expect(cells[0]).toContain('w:fill="CBEDFA"');
 expect(cells[2]).toContain('<w:gridSpan w:val="2"/>');
 expect(cells[1]).toContain('<w:vMerge w:val="restart"/>');expect(borders(cells[1]!)).toContain(single('top'));expect(borders(cells[1]!)).toContain('<w:bottom w:val="none"');
 expect(cells[3]).toContain('<w:vMerge w:val="continue"/>');expect(borders(cells[3]!)).toContain('<w:top w:val="none"');expect(borders(cells[3]!)).toContain(single('bottom'));
 expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',cellBorderPolicy:'explicit-merged-cell-perimeter'}));
});
it('keeps middle continuation cells open within a three-row merged group',async()=>{
 const t=groupLabelTemplate(),{xml}=await exported(t,groupLabelRequest(t,[{name:'GROUP',members:[{name:'A'},{name:'B'},{name:'C'}]}]));
 const cells=(xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[]).filter(c=>c.includes('<w:vMerge'));
 expect(cells).toHaveLength(3);
 expect(borders(cells[1]!)).toContain('<w:top w:val="none"');expect(borders(cells[1]!)).toContain('<w:bottom w:val="none"');
 expect(borders(cells[2]!)).toContain('<w:bottom w:val="single"');
});
