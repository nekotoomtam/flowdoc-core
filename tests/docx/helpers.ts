import * as api from '../../src/index.js';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export function fonts(){
 const license=resolve('assets/fonts/OFL.txt'),sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
 return {fonts:[['font-regular','Regular'],['font-bold','Bold'],['font-italic','Italic'],['font-bold-italic','BoldItalic']].map(([id,face])=>{const path=resolve('assets/fonts/Sarabun-'+face+'.ttf');return {id:id!,path,sha256:sha(path),licenses:[{id:'OFL-1.1',path:license,sha256:sha(license)}]};})};
}
export function composedFixture(name='binding-text',request='request.json'){
 const t=api.validateTemplate(JSON.parse(readFileSync('fixtures/'+name+'/template.json','utf8')));if(!t.ok)throw Error(JSON.stringify(t));
 const p=api.prepareGeneration(t.value,JSON.parse(readFileSync('fixtures/'+name+'/'+request,'utf8')));if(!p.ok)throw Error(JSON.stringify(p));
 const d=api.composeDocument(t.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
export function staged(){const chunks:Buffer[]=[],aborts:string[]=[];return {chunks,aborts,output:{async write(b:Uint8Array){chunks.push(Buffer.from(b));},async abort(code:string){aborts.push(code);chunks.length=0;}}};}


export const noImages:api.PdfImageProvider={contract:api.PDF_STREAM_CONTRACT,images:{},async *open(){throw Error('No image should be opened');}};
