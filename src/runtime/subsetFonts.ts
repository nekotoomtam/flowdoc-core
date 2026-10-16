import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import type {DrawDocument,PdfFontResource} from '../pdf/drawContract.js';
import type {ExportResources,FontResource} from './exportResources.js';
import {subprocessOptions} from './textRuntime.js';
const exec=promisify(execFile);
export function fontSubsetPrefix(index:number):string{
 if(!Number.isSafeInteger(index)||index<0||index>=26**4)throw Error('Too many font subsets');
 if(index<26)return 'FDPDF'+String.fromCharCode(65+index);
 return 'FD'+[26**3,26**2,26,1].map(n=>String.fromCharCode(65+Math.floor(index/n)%26)).join('');
}
export function buildSubsetRequest(draw:DrawDocument,fonts:ReadonlyArray<Pick<FontResource,'id'|'sha256'>&Partial<Pick<FontResource,'selection'|'licenses'>>>){
 const used=new Map<string,Set<number>>();
 for(const page of draw.pages)for(const command of page.commands){
  let ids=used.get(command.fontId);if(!ids){ids=new Set([0]);used.set(command.fontId,ids);}
  for(const glyph of command.glyphs)ids.add(glyph.glyphId);
 }
 return {requestVersion:1,fonts:[...used].map(([fontId,ids])=>{
  const font=fonts.find(f=>f.id===fontId);if(!font)throw Error('Missing font');
  return {fontId,sha256:font.sha256,glyphIds:[...ids].sort((a,b)=>a-b),...(font.selection?{selection:font.selection}:{}),...(font.licenses?{licenses:font.licenses}:{})};
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
  const subsetPrefix=fontSubsetPrefix(index),postScriptName=`FlowDocSubset-${index}`;
  await exec(resources.pythonExecutable,[resources.subsetHelperPath,'--request',requestPath,'--font-id',fontId,'--source',font.path,'--subset',subsetPath,'--manifest',manifestPath,'--subset-id',fontId,'--family-name','FlowDoc Subset','--postscript-name',postScriptName,'--subset-prefix',subsetPrefix,...(font.selection?['--style-name',font.selection.weight+' '+font.selection.style]:[])],subprocessOptions);
  const subsetBytes=await readFile(subsetPath),manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(createHash('sha256').update(subsetBytes).digest('hex')!==manifest.subset.sha256||manifest.source.sha256!==font.sha256||manifest.fontId!==fontId)throw Error('Subset identity mismatch');
  result.push({fontId,subsetBytes,subsetPrefix,postScriptName});
 }
 return result;
}
