import type {Glyph} from '../pdf/drawContract.js';
/** Source-only risk partition. Never changes authored line cuts or source glyphs. */
export function sourceWordBoundaries(text:string,glyphs:readonly Glyph[],breaks:readonly number[]):number[]{
 const graphemes=new Set([...new Intl.Segmenter('th',{granularity:'grapheme'}).segment(text)].map(s=>s.index));
 graphemes.add(text.length);
 const ends=[...new Set(breaks)].filter(end=>end>0&&end<=text.length&&graphemes.has(end)&&!glyphs.some(g=>g.clusterStartOffset<end&&g.clusterEndOffset>end)).sort((a,b)=>a-b);
 const output:number[]=[];let begin=0;
 for(const end of ends){
  if(/[\u0e00-\u0e7f]/.test(text.slice(begin,end))){
   const clusters=new Map<number,number>();
   for(const g of glyphs)if(g.clusterStartOffset>=begin&&g.clusterEndOffset<=end)clusters.set(g.clusterStartOffset,(clusters.get(g.clusterStartOffset)??0)+(Math.round(g.advancePt*20)/20-g.advancePt));
   let accumulated=0,part=begin;
   for(const [start,error]of [...clusters].sort((a,b)=>a[0]-b[0])){
    if(Math.abs(accumulated+error)>3/20+1e-9&&start>part&&graphemes.has(start)&&!glyphs.some(g=>g.clusterStartOffset<start&&g.clusterEndOffset>start)){output.push(start);part=start;accumulated=error;}
    else accumulated+=error;
   }
  }
  output.push(end);begin=end;
 }
 return output;
}
