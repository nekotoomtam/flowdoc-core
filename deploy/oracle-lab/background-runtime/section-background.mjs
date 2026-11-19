import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire('/candidate/package.json');
const assetDirectory = '/lab/template-assets/eagletainer/v1/';
const id = 'section-background-eagletainer-v1';
let loaded;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

async function loadAsset(binding, path) {
 const bytes = await readFile(path);
 if (sha(bytes) !== binding.sha256) throw Error('Section background checksum mismatch');
 const {data,info} = await require('sharp')(bytes).removeAlpha().toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
 if (info.channels !== 3) throw Error('Section background must be RGB');
 const compressed = deflateSync(data);
 return {binding, bytes, raw:data, compressed, width:info.width,height:info.height};
}
async function selected(document) {
 const {docKey,templateId,version}=document.template;
 if(docKey==='eagletainer-delivery-order-ruled-fields-20261118'&&version>1) {
  const dir='/lab/editor-publications/';
  const binding=JSON.parse(await readFile(dir+'v'+version+'.json','utf8'));
  if(binding.templateId!==templateId||binding.version!==version||!/^([a-f0-9]{64})$/.test(binding.sha256))throw Error('Published Section background binding mismatch');
  return loadAsset(binding,dir+'objects/'+binding.sha256+'.png');
 }
 if(version!==1) return;
 const candidate=/^eagletainer-bg-editor-([0-9a-f]{64})$/.exec(docKey);
 if(candidate) {
  const dir='/lab/editor-background/';
  const binding=JSON.parse(await readFile(dir+'pins/'+candidate[1]+'.json','utf8'));
  if(binding.templateId!==templateId||binding.sha256!==candidate[1])throw Error('Invalid Editor background binding');
  const published=JSON.parse(await readFile(assetDirectory+'section-background.json','utf8'));
  const path=binding.sha256===published.sha256?assetDirectory+'eagletainer-do-watermark.png':dir+'images/'+binding.sha256+'.png';
  return loadAsset(binding,path);
 }
 if (!['eagletainer-delivery-order-ruled-fields-20261118','eagletainer-section-background-preview-20261118'].includes(docKey)) return;
 const binding=JSON.parse(await readFile(assetDirectory+'section-background.json','utf8'));
 if (![binding.templateId,binding.previewTemplateId].includes(templateId) || version !== binding.version) throw Error('Invalid Section background binding');
 return loaded ??= loadAsset(binding,assetDirectory+'eagletainer-do-watermark.png');
}
export async function addPdfSectionBackground(document, draw, provider, legacyImages) {
 const asset = await selected(document);
 if (!asset) return {provider,legacyImages};
 const target = new Set(document.sections.filter(section=>section.definitionId===asset.binding.sectionId).map(section=>section.sectionId));
 for (const page of draw.pages) {
  if (!target.has(page.sectionId)) continue;
  page.images = [{resourceId:id,xPt:0,yPt:0,widthPt:page.widthPt,heightPt:page.heightPt},...(page.images??[])];
 }
 if (!provider) return {provider,legacyImages:{...legacyImages,[id]:{kind:'rgb',width:asset.width,height:asset.height,bytes:asset.raw}}};
 const key = id + '-rgb';
 const content = {key,byteLength:asset.compressed.length,sha256:sha(asset.compressed)};
 return {legacyImages,provider:{contract:provider.contract,images:{...provider.images,[id]:{kind:'rgb-deflate',width:asset.width,height:asset.height,content}},
  async *open(request,signal){if(request.key!==key){yield* provider.open(request,signal);return;} for(let offset=0;offset<asset.compressed.length;offset+=65536){signal?.throwIfAborted();yield asset.compressed.subarray(offset,offset+65536);}}
 }};
}

export function orderSectionBackground(page, insert, render) {
 const images = page.images ?? [];
 const background = images.find(image=>image.resourceId===id);
 const foreground = images.filter(image=>image.resourceId!==id).map(render).join('');
 if (!background) return Buffer.concat([insert,Buffer.from(foreground,'ascii')]);
 const split = insert.indexOf('\nQ\n');
 if (split<0) throw Error('Missing PDF paper paint');
 return Buffer.concat([insert.subarray(0,split+3),Buffer.from(render(background),'ascii'),insert.subarray(split+3),Buffer.from(foreground,'ascii')]);
}

const relationshipNamespace='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function drawing(index,cx,cy) {
 return `<w:r><w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="${relationshipNamespace}"><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="0" layoutInCell="0" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${900000+index}" name="Eagletainer Section background"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="Section background"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdEagletainerBackground"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
}
export async function addWordSectionBackground(document,zip) {
 const asset=await selected(document);
 if(!asset) return false;
 // Lab candidate supports the Eagletainer profile, whose instances all share
 // the same Section definition and have repeating native headers.
 if(!document.sections.every(section=>section.definitionId===asset.binding.sectionId&&section.headerMode==='all')) throw Error('Unexpected Eagletainer section layout');
 const main=await zip.file('word/document.xml').async('string');
 const size=/<w:pgSz\b[^>]*\bw:w="(\d+)"[^>]*\bw:h="(\d+)"/.exec(main);
 if(!size) throw Error('Missing native page size');
 const headers=Object.keys(zip.files).filter(path=>/^word\/header\d+\.xml$/.test(path));
 if(!headers.length) throw Error('Missing repeating header');
 zip.file('word/media/eagletainer-section-background.png',asset.bytes);
 for(const [index,path] of headers.entries()){
  const relPath='word/_rels/'+path.split('/').at(-1)+'.rels';
  const old=zip.file(relPath);
  const rel=old ? await old.async('string') : '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const img=`<Relationship Id="rIdEagletainerBackground" Type="${relationshipNamespace}/image" Target="media/eagletainer-section-background.png"/>`;
  if(!rel.includes('</Relationships>')) throw Error('Missing header relationships');
  zip.file(relPath,rel.replace('</Relationships>',img+'</Relationships>'));
  const xml=await zip.file(path).async('string');
  const start=[...xml.matchAll(/<w:p(?:\s[^>]*)?>/g)].at(-1);
  if(!start) throw Error('Missing native header paragraph');
  const offset=start.index+start[0].length;
  const props=/<\/w:pPr>/.exec(xml.slice(offset,xml.indexOf('</w:p>',offset)));
  const place=offset+(props?props.index+props[0].length:0);
  zip.file(path,xml.slice(0,place)+drawing(index,Number(size[1])*635,Number(size[2])*635)+xml.slice(place));
 }
 return true;
}

