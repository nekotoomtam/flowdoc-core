export interface SourceFrame {heightPt:number;frameTwips:number;}
export interface SourceFrameCell {paddingPt:number;lines:SourceFrame[];}
/** Quantize continuous source row boundaries without accumulating row rounding. */
export function quantizeSourceRows(rows:SourceFrameCell[][]):void {
 let source=0,emitted=0;
 for(const cells of rows){
  source+=Math.max(...cells.map(c=>c.paddingPt+c.lines.reduce((s,l)=>s+l.heightPt,0)));
  const native=Math.max(...cells.map(c=>Math.round(c.paddingPt*20)+c.lines.reduce((s,l)=>s+l.frameTwips,0)));
  const target=Math.round(source*20)-emitted,delta=target-native;
  for(const cell of cells){const last=cell.lines.at(-1)!;if(last.frameTwips+delta<1)throw new RangeError('Source row frame quantizes to zero');last.frameTwips+=delta;}
  emitted+=target;
 }
}
