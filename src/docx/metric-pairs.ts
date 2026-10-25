/** Translate only one-to-one ASCII letter-pair advance differences from the
 * pinned source shaper to native twip tracking. Thai graphemes, substitutions,
 * mark positioning and cross-span pairs are deliberately outside this rule.
 */
export function deriveMetricPairs(text:string,raw:any,fontBytes:Uint8Array,sizePt:number):ReadonlyMap<number,number>{
 const result=new Map<number,number>(),font=Buffer.from(fontBytes);
 const tables=new Map<string,number>();
 for(let i=0;i<font.readUInt16BE(4);i++){
  const at=12+i*16;tables.set(font.toString('ascii',at,at+4),font.readUInt32BE(at+8));
 }
 const hhea=tables.get('hhea'),hmtx=tables.get('hmtx');
 if(hhea===undefined||hmtx===undefined)return result;
 const metrics=font.readUInt16BE(hhea+34);if(!metrics)return result;
 const offsets=new Map<number,number>();let byte=0,index=0;
 for(const c of text){offsets.set(byte,index);byte+=Buffer.byteLength(c);index+=c.length;}
 const byCluster=new Map<number,any[]>();
 for(const g of raw.glyphs){const list=byCluster.get(g.cluster)??[];list.push(g);byCluster.set(g.cluster,list);}
 const starts=[...byCluster.keys()].sort((a,b)=>a-b),ends=new Map(starts.map((start,i)=>[start,starts[i+1]??byte]));
 for(const [cluster,glyphs] of byCluster){
  const at=offsets.get(cluster);if(at===undefined||!/[A-Za-z]{2}/u.test(text.slice(at,at+2))||glyphs.length!==1)continue;
  const next=byCluster.get(cluster+1),g=glyphs[0];
  if(next?.length!==1||ends.get(cluster)!==cluster+1||ends.get(cluster+1)!==cluster+2||g.xOffset!==0||g.yOffset!==0||next[0].xOffset!==0||next[0].yOffset!==0)continue;
  // Adjacent scalar-start clusters rule out a multi-letter ligature here.
  const nominal=font.readUInt16BE(hmtx+Math.min(g.glyphId,metrics-1)*4);
  const delta=(g.xAdvance-nominal)*sizePt/raw.unitsPerEm;
  if(!Number.isFinite(delta)||Math.abs(delta)>sizePt/4)continue;
  const twips=Math.round(delta*20);if(twips)result.set(at,twips);
 }
 return result;
}
/** A conservative unwrapped advance bound includes both native nominal widths
 * and the source shaper's actual positioned ink. Used only for table admission.
 */
export function unwrappedAdvancePt(raw:any,fontBytes:Uint8Array,sizePt:number):number{
 const scalarEnds=new Map<number,number>();let bytes=0;
 for(const c of raw.text){const start=bytes;bytes+=Buffer.byteLength(c);scalarEnds.set(start,bytes);}
 const clusters=raw.glyphs.map((g:any)=>g.cluster) as number[],starts=[...new Set(clusters)].sort((a,b)=>a-b);
 if(starts.length!==clusters.length||starts.some((start,i)=>scalarEnds.get(start)!==(starts[i+1]??bytes)))return Infinity;
 const font=Buffer.from(fontBytes),tables=new Map<string,number>();
 for(let i=0;i<font.readUInt16BE(4);i++){const at=12+i*16;tables.set(font.toString('ascii',at,at+4),font.readUInt32BE(at+8));}
 const metrics=font.readUInt16BE(tables.get('hhea')!+34),hmtx=tables.get('hmtx')!;
 let nominal=0,cursor=0,left=0,right=0;
 for(const g of raw.glyphs){
  nominal+=font.readUInt16BE(hmtx+Math.min(g.glyphId,metrics-1)*4);
  if(g.ink){left=Math.min(left,cursor+g.xOffset+g.ink.xMin);right=Math.max(right,cursor+g.xOffset+g.ink.xMax);}
  cursor+=g.xAdvance;
 }
 const width=Math.max(nominal,Math.max(cursor,right)-left)*sizePt/raw.unitsPerEm;
 return Number.isFinite(width)?width:Infinity;
}
/** Preserve each complete ASCII word's nominal advance. The compensating
 * terminal tracking cannot cross a span, a script boundary or a substitution.
 * Native output still needs verification: Word may round split runs itself.
 */
export function neutralMetricPairs(text:string,raw:any,fontBytes:Uint8Array,sizePt:number):ReadonlyMap<number,number>{
 const pairs=deriveMetricPairs(text,raw,fontBytes,sizePt),result=new Map<number,number>();
 const clusters=new Map<number,any[]>();
 for(const g of raw.glyphs){const list=clusters.get(g.cluster)??[];list.push(g);clusters.set(g.cluster,list);}
 const bytes=Buffer.byteLength(text),starts=[...clusters.keys()].sort((a,b)=>a-b),ends=new Map(starts.map((s,i)=>[s,starts[i+1]??bytes]));
 for(const word of text.matchAll(/[A-Za-z]+/g)){
  const at=word.index,from=Buffer.byteLength(text.slice(0,at)),length=word[0].length;
  if(length<2||Array.from({length},(_,i)=>from+i).some(c=>clusters.get(c)?.length!==1||ends.get(c)!==c+1||clusters.get(c)![0].xOffset!==0||clusters.get(c)![0].yOffset!==0))continue;
  const entries=[...pairs].filter(([offset])=>offset>=at&&offset<at+length-1);
  if(!entries.length)continue;
  const sum=entries.reduce((n,[,delta])=>n+delta,0);
  if(Math.abs(sum)>sizePt*20/4)continue;
  for(const [offset,delta] of entries)result.set(offset,delta);
  if(sum)result.set(at+length-1,-sum);
 }
 return result;
}
