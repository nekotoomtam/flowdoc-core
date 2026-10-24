export interface CellVerticalSpace {
 nodeId:string;nativeTopTwips:number;nativeBottomTwips:number;
 paragraphBeforeTwips:number;paragraphAfterTwips:number;
}
/** Keep each cell's total inset without exporting unequal row margin maxima. */
export function distributeVerticalOffsets(cells:CellVerticalSpace[],eligible:boolean):boolean {
 if(!eligible||cells.length<2)return false;
 const top=Math.min(...cells.map(c=>c.nativeTopTwips)),bottom=Math.min(...cells.map(c=>c.nativeBottomTwips));
 if(cells.every(c=>c.nativeTopTwips===top&&c.nativeBottomTwips===bottom))return false;
 for(const c of cells){
  c.paragraphBeforeTwips=c.nativeTopTwips-top;c.paragraphAfterTwips=c.nativeBottomTwips-bottom;
  c.nativeTopTwips=top;c.nativeBottomTwips=bottom;
 }return true;
}
