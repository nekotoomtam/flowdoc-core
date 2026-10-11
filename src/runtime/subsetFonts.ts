import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import type {DrawDocument,PdfFontResource} from '../pdf/drawContract.js';
import type {ExportResources} from './exportResources.js';
import {subprocessOptions} from './textRuntime.js';
const exec=promisify(execFile);
export function buildSubsetRequest(draw:DrawDocument,fonts:ReadonlyArray<{id:string;sha256:string}>){
 const used=new Map<string,Set<number>>();
 for(const page of draw.pages)for(const command of page.commands){
  let ids=used.get(command.fontId);if(!ids){ids=new Set([0]);used.set(command.fontId,ids);}
  for(const glyph of command.glyphs)ids.add(glyph.glyphId);
 }
 return {requestVersion:1,fonts:[...used].map(([fontId,ids])=>{
  const font=fonts.find(f=>f.id===fontId);if(!font)throw Error('Missing font');
  return {fontId,sha256:font.sha256,glyphIds:[...ids].sort((a,b)=>a-b)};
 })};
}
export async function subsetFonts(draw:DrawDocument,resources:ExportResources,temp:string):Promise<PdfFontResource[]>{
 const request=buildSubsetRequest(draw,resources.fonts),used=request.fonts.map(f=>f.fontId);
 const requestPath=join(temp,'request.json');
 await writeFile(requestPath,JSON.stringify(request));
 const result:PdfFontResource[]=[];
 for(const [index,fontId] of used.entries()){
  const font=resources.fonts.find(f=>f.id===fontId);if(!font)throw Error('Missing font');
  const subsetPath=join(temp,`font-${index}.ttf`),manifestPath=join(temp,`font-${index}.json`);
  const subsetPrefix=`FDPDF${String.fromCharCode(65+index)}`,postScriptName=`FlowDocSubset-${index}`;
  await exec(resources.pythonExecutable,[resources.subsetHelperPath,'--request',requestPath,'--font-id',fontId,'--source',font.path,'--subset',subsetPath,'--manifest',manifestPath,'--subset-id',fontId,'--family-name','FlowDoc Subset','--postscript-name',postScriptName,'--subset-prefix',subsetPrefix],subprocessOptions);
  const subsetBytes=await readFile(subsetPath),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(createHash('sha256').update(subsetBytes).digest('hex')!==manifest.subset.sha256||manifest.source.sha256!==font.sha256)throw Error('Subset identity mismatch');
  result.push({fontId,subsetBytes,subsetPrefix,postScriptName});
 }
 return result;
}
