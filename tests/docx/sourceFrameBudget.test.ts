import {it,expect} from 'vitest';
import {quantizeSourceRows,type SourceFrameCell} from '../../src/docx/source-frame-budget.js';

it('keeps every row boundary within half a twip of continuous source height',()=>{
 const heights=[121.792,97.28,122.08,97.28,121.28,121.28];
 const rows:SourceFrameCell[][]=heights.map(height=>[height,height-7.1].map(h=>({paddingPt:8,lines:[{heightPt:h,frameTwips:Math.round(h*20)}]})));
 quantizeSourceRows(rows);
 let source=0,native=0;
 for(const cells of rows){source+=Math.max(...cells.map(c=>c.paddingPt+c.lines.reduce((s,l)=>s+l.heightPt,0)));native+=Math.max(...cells.map(c=>c.paddingPt*20+c.lines.reduce((s,l)=>s+l.frameTwips,0)));expect(Math.abs(native/20-source)).toBeLessThanOrEqual(.025000001);}
 const once=JSON.stringify(rows);quantizeSourceRows(rows);expect(JSON.stringify(rows)).toBe(once);
});

it('bounds long tables without changing authored line metrics or earlier frames',()=>{
 const rows:SourceFrameCell[][]=Array.from({length:100},(_,i)=>[0,1].map(j=>({paddingPt:8,lines:[{heightPt:18.032,frameTwips:361},{heightPt:18.032+(i%3)*.003+j*.17,frameTwips:Math.round((18.032+(i%3)*.003+j*.17)*20)}]})));
 const original=structuredClone(rows);quantizeSourceRows(rows);
 let source=0,native=0;
 rows.forEach((cells,i)=>{source+=Math.max(...cells.map(c=>c.paddingPt+c.lines.reduce((s,l)=>s+l.heightPt,0)));native+=Math.max(...cells.map(c=>c.paddingPt*20+c.lines.reduce((s,l)=>s+l.frameTwips,0)));expect(Math.abs(native/20-source)).toBeLessThanOrEqual(.025000001);cells.forEach((c,j)=>{expect(c.lines.map(l=>l.heightPt)).toEqual(original[i]![j]!.lines.map(l=>l.heightPt));expect(c.lines[0]!.frameTwips).toBe(original[i]![j]!.lines[0]!.frameTwips);expect(c.lines.at(-1)!.frameTwips).toBeGreaterThan(0);});});
});
