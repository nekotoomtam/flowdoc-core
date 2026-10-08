import { createHash } from 'node:crypto';
import { parseSfnt, unicodeAssignments, buildPageContent, assemblePdf } from './primitives.js';
import type { DrawDocument, PdfFontResource } from './drawContract.js';

interface ResolvedGlyph {cid:number;glyphId:number;width:number;unicode:string;offsetX:number}
export function writePdf(draw: DrawDocument, resources: PdfFontResource[]): Uint8Array {
  const used = new Set(draw.pages.flatMap(p=>p.commands.map(c=>c.fontId)));
  if(new Set(resources.map(r=>r.fontId)).size!==resources.length)throw Error('Duplicate font');
  const usages = [...used].map((fontId,index)=>{
    const resource=resources.find(r=>r.fontId===fontId);
    if(!resource || !/^[A-Z]{6}$/.test(resource.subsetPrefix) || !/^[A-Za-z][A-Za-z0-9-]*$/.test(resource.postScriptName))throw Error('Invalid font resource');
    return {asset:{fontId},resource,metrics:parseSfnt(resource.subsetBytes),pdfResourceName:`F${index+1}`,pdfBaseFontName:`${resource.subsetPrefix}+${resource.postScriptName}`,glyphs:[] as ResolvedGlyph[]};
  });
  const runs=new Map<string,ResolvedGlyph[]>();
  for(const page of draw.pages)for(const command of page.commands){
    const usage=usages.find(u=>u.asset.fontId===command.fontId)!;
    const assignments=unicodeAssignments(command,true);
    if(!assignments)throw Error('Unmappable glyph cluster');
    const resolved=command.glyphs.map((g,index)=>{
      if(!Number.isInteger(g.glyphId)||g.glyphId<=0||g.glyphId>=usage.metrics.numGlyphs)throw Error('Invalid subset glyph');
      const glyph={cid:usage.glyphs.length+1,glyphId:g.glyphId,width:Math.round(g.advancePt/command.fontSizePt*1000),unicode:assignments[index]!,offsetX:g.offsetXPt/command.fontSizePt*1000};
      if(glyph.cid>65535)throw Error('Font CID capacity exceeded');
      usage.glyphs.push(glyph);return glyph;
    });
    runs.set(command.id,resolved);
  }
  const fingerprint='sha256:'+createHash('sha256').update(JSON.stringify(draw)).digest('hex');
  return assemblePdf({...draw,fingerprint},usages,[],draw.pages.map(p=>buildPageContent(p,usages,runs)));
}
