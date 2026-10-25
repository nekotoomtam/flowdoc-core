import {expect,it} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {groupLabelTemplate,groupLabelRequest} from '../helpers/groupLabels.js';
import {fonts,noImages,staged} from './helpers.js';

const take=<T>(r:api.Result<T>):T=>{if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
function compose(groups:any[]){const t=groupLabelTemplate(),v=take(api.validateTemplate(t));return take(api.composeDocument(v,take(api.prepareGeneration(v,groupLabelRequest(t,groups)))));}
it.each([0,1,3,80])('exports group labels as native vertical merges with %i members, preserving ordinary flow',async count=>{
 const groups=[{name:'MODULE-A',members:Array.from({length:count},(_,i)=>({name:`ITEM-${i}-END`}))},{name:'MODULE-B',members:[{name:'SECOND-END'}]}];
 const d=compose(groups),before=JSON.stringify(d),engine=take(await api.createDocxEngine(fonts())),sink=staged();
 const receipt=take(await engine.generateDocxTo(d,noImages,sink.output));
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await z.file('word/document.xml')!.async('string');
 const text=[...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m=>m[1]).join('');
 expect(text.split('MODULE-A')).toHaveLength(2);
 expect(text.split('MODULE-B')).toHaveLength(2);
 expect((xml.match(/<w:vMerge w:val="restart"\/>/g)??[])).toHaveLength(count>1?1:0);
 expect((xml.match(/<w:vMerge w:val="continue"\/>/g)??[])).toHaveLength(Math.max(0,count-1));
 for(let i=0;i<count;i++)expect(text.split(`ITEM-${i}-END`)).toHaveLength(2);
 expect(text).toContain('SECOND-END');expect(xml).not.toContain('(ต่อ)');
 expect(xml).not.toContain('<w:keepNext/>');expect(xml).not.toContain('w:type="page"');
 expect(receipt.adaptations).toEqual(expect.arrayContaining([expect.objectContaining({kind:'group-label-native-merge',policy:'native-rowspan',continuationLabel:'not-repeated',wordVerified:false})]));
 expect(JSON.stringify(d)).toBe(before);expect(sink.aborts).toEqual([]);
});
it('rejects malformed group label metadata before writing',async()=>{
 const d:any=compose([{name:'GROUP',members:[{name:'A'},{name:'B'}]}]);
 const table:any=Object.values(d.nodes).find((n:any)=>n.type==='table');table.rowGroups[0].groupLabel.memberCount=30;
 const sink=staged(),r=await take(await api.createDocxEngine(fonts())).generateDocxTo(d,noImages,sink.output);
 expect(r.ok).toBe(false);expect(sink.chunks).toEqual([]);expect(sink.aborts).toHaveLength(1);
});
it('keeps only a short prefix with the first member, including a merged label',async()=>{
 const t=groupLabelTemplate();delete t.areaFormats.meeting.rowGroups[0].pagination;
 for(const s of Object.values(t.styles) as any[]){s.fontSize={unit:'pt',value:8};s.lineHeightPt=12;}
 t.areaFormats.meeting.rowGroups[0].rowTemplateIds.unshift('before');
 const v=take(api.validateTemplate(t)),d=take(api.composeDocument(v,take(api.prepareGeneration(v,groupLabelRequest(t,[{name:'G',members:[{name:'A'},{name:'B'}]}])))));
 const e=take(await api.createDocxEngine(fonts())),sink=staged();take(await e.generateDocxTo(d,noImages,sink.output));
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await z.file('word/document.xml')!.async('string');
 expect(xml).toContain('<w:vMerge w:val="restart"/>');expect(xml).toContain('<w:keepNext/>');
 const rows=xml.match(/<w:tr>[\s\S]*?<\/w:tr>/g)??[];
 expect(rows.filter(r=>r.includes('<w:keepNext/>'))).toHaveLength(1);
});
