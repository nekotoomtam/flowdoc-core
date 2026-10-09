import {it,expect} from 'vitest';
import {contentsDocument} from '../helpers/contents.js';
import {document,fakeRuntime} from '../helpers/document.js';
import {mergedDoc} from '../helpers/merged.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';
import {appendPageNumbers} from '../../src/layout/pageNumbers.js';
it.each([3,100])('fills %i entries from actual destinations without changing positioned content',async count=>{
 const d=contentsDocument(count),draw=await documentFlow(d,fakeRuntime),before=structuredClone(draw.pages),slots=structuredClone(draw.contentsSlots!),anchors=indexDestinations(d,draw);
 await fillContentsNumbers(draw,anchors,fakeRuntime);await appendPageNumbers(d,draw,fakeRuntime);resolveLinkGeometry(d,draw,anchors);
 expect(draw.contentsSlots).toBeUndefined();
 for(const [i,p] of before.entries())expect(draw.pages[i]!.commands.slice(0,p.commands.length)).toEqual(p.commands);
 for(const [i,slot] of slots.entries()){const run=draw.pages[slot.pageIndex]!.commands.find(r=>r.id===`contents-number-${i}`)!;expect(run.text).toBe(String(anchors[slot.anchorId]!.pageIndex+1));expect(run.bounds.yPt).toBe(slot.yPt);expect(run.bounds.xPt+run.bounds.widthPt).toBeCloseTo(slot.xPt+slot.widthPt);}
 for(const [i,p] of draw.pages.entries()){const footer=p.commands.at(-1)!;expect(footer.text).toBe(String(i+1));expect(footer.bounds.yPt).toBeGreaterThan(p.heightPt-20*72/25.4);expect(p.annotations?.some(a=>a.linkId.startsWith('contents-number-'))??false).toBe(slots.some(s=>s.pageIndex===i));}
});
it('retains the first physical repeated table header as destination',async()=>{const d=mergedDoc(100);d.nodeModelVersion=8;d.nodes.toc={id:'toc',type:'table-of-contents',props:{textStyleId:'body'}};d.rootIds.push('toc');d.nodes.ht.props={textStyleId:'body',anchorId:'header',toc:{level:1}};const draw=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,draw);expect(draw.pages.filter(p=>p.commands.some(r=>r.nodeId==='ht')).length).toBeGreaterThan(1);expect(anchors.header!.pageIndex).toBe(0);await fillContentsNumbers(draw,anchors,fakeRuntime);expect(draw.pages.flatMap(p=>p.commands).find(r=>r.id==='contents-number-0')!.text).toBe('1');});
it('fails oversized ink and height rather than wrapping a number',async()=>{for(const shape of [async(text:string)=>({...await fakeRuntime.shape(text),inkRightPt:100}),async(text:string)=>({...await fakeRuntime.shape(text),ascentPt:30})]){const d=contentsDocument(1),draw=await documentFlow(d,fakeRuntime);await expect(fillContentsNumbers(draw,indexDestinations(d,draw),{...fakeRuntime,shape})).rejects.toThrow(/fit/);}});
it('keeps legacy and no-contents documents footer-free and rejects insufficient footer margin',async()=>{for(const d of [document(),{...document(),nodeModelVersion:8} as any]){const draw=await documentFlow(d,fakeRuntime),before=structuredClone(draw);await appendPageNumbers(d,draw,fakeRuntime);expect(draw).toEqual(before);}const d=contentsDocument(1);d.book.page.margin.bottom={value:17,unit:'pt'};const draw=await documentFlow(d,fakeRuntime);await expect(appendPageNumbers(d,draw,fakeRuntime)).rejects.toThrow(/margin/);});
it('accounts for left and right glyph ink when right-aligning linked numbers',async()=>{const d=contentsDocument(1),draw=await documentFlow(d,fakeRuntime),slot=draw.contentsSlots![0]!;await fillContentsNumbers(draw,indexDestinations(d,draw),{...fakeRuntime,shape:async(text:string)=>({...await fakeRuntime.shape(text),inkLeftPt:-2,inkRightPt:8,glyphInkBoundsPt:[{left:-2,right:8}]})});const run=draw.pages[0]!.commands.at(-1)!;expect(run.bounds.xPt+8).toBeCloseTo(slot.xPt+slot.widthPt);resolveLinkGeometry(d,draw);expect(draw.pages[0]!.annotations!.at(-1)!.rect.widthPt).toBe(10);});
