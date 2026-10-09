import {validateExternalUrl} from '../composition/linkContract.js';
import { createHash } from 'node:crypto';
import { parseSfnt, unicodeAssignments, buildPageContent, assemblePdf } from './primitives.js';
import type { DrawDocument, PdfFontResource } from './drawContract.js';
import {deflateSync} from 'node:zlib';
import {validateImageResources} from './imageResources.js';
import type {PdfImageResources} from './imageResources.js';

interface ResolvedGlyph {cid:number;glyphId:number;width:number;unicode:string;offsetX:number}
export function writePdf(draw: DrawDocument, resources: PdfFontResource[],images:PdfImageResources={}): Uint8Array {
  validateImageResources(images);
  for(const anchor of Object.values(draw.anchors??{})){const page=draw.pages[anchor.pageIndex];if(!Number.isInteger(anchor.pageIndex)||!page||![anchor.xPt,anchor.yPt].every(Number.isFinite)||anchor.xPt<0||anchor.yPt<0||anchor.xPt>page.widthPt||anchor.yPt>page.heightPt)throw Error('Invalid PDF destination');}
  for(const page of draw.pages)for(const a of page.annotations??[]){
   const r=a.rect;if(![r.xPt,r.yPt,r.widthPt,r.heightPt].every(Number.isFinite)||r.widthPt<=0||r.heightPt<=0||r.xPt<0||r.yPt<0||r.xPt+r.widthPt>page.widthPt+1e-6||r.yPt+r.heightPt>page.heightPt+1e-6)throw Error('Invalid link geometry');
   const d=a.destination;if(d.type==='external'){if(!validateExternalUrl(d.url))throw Error('Invalid external action');}else if(d.type!=='internal'||!Object.hasOwn(draw.anchors??{},d.target))throw Error('Invalid internal action');
  }
  const imageIds=[...new Set(draw.pages.flatMap(p=>(p.images??[]).map(i=>i.resourceId)))];
  const imageUsages=imageIds.map((id,index)=>{const r=Object.hasOwn(images,id)?images[id]:undefined;if(!r)throw Error('Missing image resource');return {id,name:`Im${index+1}`,width:r.width,height:r.height,filter:r.kind==='jpeg'?'DCTDecode':'FlateDecode',bytes:r.kind==='jpeg'?r.bytes:deflateSync(r.bytes),alpha:r.kind==='rgb'&&r.alpha?deflateSync(r.alpha):undefined};});
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
  const identity=createHash('sha256').update(JSON.stringify(draw));
  for(const image of imageUsages){identity.update(image.bytes);if(image.alpha)identity.update(image.alpha);}
  const fingerprint='sha256:'+identity.digest('hex');
  return assemblePdf({...draw,fingerprint},usages,imageUsages,draw.pages.map(p=>{
   const imageContent=(p.images??[]).map(i=>{if(![i.xPt,i.yPt,i.widthPt,i.heightPt].every(Number.isFinite)||i.widthPt<=0||i.heightPt<=0)throw Error('Invalid image geometry');return `q ${i.widthPt} 0 0 ${i.heightPt} ${i.xPt} ${p.heightPt-i.yPt-i.heightPt} cm /${imageUsages.find(r=>r.id===i.resourceId)!.name} Do Q\n`;}).join('');
   return Buffer.concat([buildPageContent(p,usages,runs),Buffer.from(imageContent,'ascii')]);
  }));
}
