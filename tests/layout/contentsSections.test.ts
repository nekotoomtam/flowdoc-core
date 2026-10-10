import {it,expect} from 'vitest';
import {contentsDocument} from '../helpers/contents.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';

function scoped(count:number,title='หัวข้อ') {
 const d=contentsDocument(count,title);d.nodeModelVersion=16;
 d.sections=[{sectionId:'contents',rootIds:['toc'],page:d.book.page,numbering:{mode:'continue'}},
 {sectionId:'hidden',rootIds:d.rootIds.slice(1,-1),page:d.book.page,numbering:{mode:'restart',startAt:1,visibility:'hide'}},
 {sectionId:'excluded',rootIds:d.rootIds.slice(-1),page:d.book.page,numbering:{mode:'exclude'}}];
 return d;
}
it.each([3,120])('keeps excluded title links and fills hidden counted numbers for %i headings',async count=>{
 const d=scoped(count),draw=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,draw);
 const before=structuredClone(draw.pages),slots=structuredClone(draw.contentsSlots!);
 await fillContentsNumbers(draw,anchors,fakeRuntime,true);resolveLinkGeometry(d,draw,anchors);
 for(const [i,p] of before.entries())expect(draw.pages[i]!.commands.slice(0,p.commands.length)).toEqual(p.commands);
 for(const [i,slot] of slots.entries()){
  const run=draw.pages[slot.pageIndex]!.commands.find(r=>r.id===`contents-number-${i}`),target=anchors[slot.anchorId]!;
  if(i===count-1)expect(run).toBeUndefined();else expect(run!.text).toBe(String(draw.pages[target.pageIndex]!.pageNumbering!.current));
  expect(draw.pages.flatMap(p=>p.annotations??[]).some(a=>a.destination.type==='internal'&&a.destination.target===slot.anchorId)).toBe(true);
 }
 if(count===120)expect(new Set(slots.map(s=>s.pageIndex)).size).toBeGreaterThan(1);
});
it('retains a wrapped excluded heading across TOC and destination page breaks',async()=>{
 const d=scoped(2,'หัวข้อยาว '.repeat(700)),draw=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,draw);
 expect(draw.pages.filter(p=>p.commands.some(r=>r.nodeId==='toc')).length).toBeGreaterThan(2);
 const first=draw.pages.findIndex(p=>p.commands.some(r=>r.nodeId==='h1'));expect(anchors.h1!.pageIndex).toBe(first);
 await fillContentsNumbers(draw,anchors,fakeRuntime,true);resolveLinkGeometry(d,draw,anchors);
 expect(draw.pages.flatMap(p=>p.commands).filter(r=>r.id.startsWith('contents-number-'))).toHaveLength(1);
 expect(draw.pages.flatMap(p=>p.annotations??[]).filter(a=>a.destination.type==='internal'&&a.destination.target==='h1').length).toBeGreaterThan(1);
});
it('still rejects missing destination or missing numbering metadata',async()=>{
 const d=scoped(2),draw=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,draw);
 await expect(fillContentsNumbers(draw,{},fakeRuntime,true)).rejects.toThrow(/Missing contents destination/);
 delete draw.pages[anchors.h0!.pageIndex]!.pageNumbering;
 await expect(fillContentsNumbers(draw,anchors,fakeRuntime,true)).rejects.toThrow(/metadata/);
});
