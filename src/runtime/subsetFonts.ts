import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import type {DrawDocument,PdfFontResource} from '../pdf/drawContract.js';
import type {ExportResources} from './exportResources.js';
import {subprocessOptions} from './textRuntime.js';
const exec=promisify(execFile);
export async function subsetFonts(draw:DrawDocument,resources:ExportResources,temp:string):Promise<PdfFontResource[]>{
 const commands=draw.pages.flatMap(p=>p.commands),used=[...new Set(commands.map(c=>c.fontId))];
 const requestPath=join(temp,'request.json');
 await writeFile(requestPath,JSON.stringify({fontAssets:resources.fonts.map(f=>({fontId:f.id,sha256:f.sha256})),paintCommands:commands}));
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
