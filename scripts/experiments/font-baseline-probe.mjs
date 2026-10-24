// Local experiment: preserve line geometry and use verified font descent.
export function fontDescent(bytes){
 const b=Buffer.from(bytes);for(let i=0;i<b.readUInt16BE(4);i++){
  const p=12+i*16;if(b.toString('ascii',p,p+4)==='hhea')return -b.readInt16BE(b.readUInt32BE(p+8)+6)/units(b);
 }throw Error('Missing hhea');
}
function units(b){for(let i=0;i<b.readUInt16BE(4);i++){const p=12+i*16;if(b.toString('ascii',p,p+4)==='head')return b.readUInt16BE(b.readUInt32BE(p+8)+18);}throw Error('Missing head');}
export function bottomBaseline(height,size,descent,shape){
 const baseline=Math.max(shape.ascentPt,Math.min(height-size*descent,height-shape.descentPt));
 if(!Number.isFinite(baseline)||baseline<shape.ascentPt-1e-6||baseline+shape.descentPt>height+1e-6)throw Error('Unsafe font baseline');
 return baseline;
}
export function nominalLatin(shape,text,font,size){
 let cursor=0,left=0,right=0;
 const glyphs=shape.glyphs.map((g,i)=>{
  const plain=g.clusterEndOffset===g.clusterStartOffset+1&&/^[\x20-\x7e]$/.test(text.slice(g.clusterStartOffset,g.clusterEndOffset));
  const ink=shape.glyphInkBoundsPt?.[i];if(ink){left=Math.min(left,cursor+ink.left);right=Math.max(right,cursor+ink.right);}
  const next=plain?{...g,advancePt:font.advance(g.glyphId,size)}:g;cursor+=next.advancePt;return next;
 });
 return {...shape,glyphs,inkLeftPt:left,inkRightPt:right};
}
