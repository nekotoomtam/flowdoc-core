import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {validateTemplate,prepareGeneration,composeDocument,normalizeTaskInput,composeTaskDocument} from '../../src/index.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {preflightDocx} from '../../src/docx/profile.js';
import {assemblyTemplate,assemblyRequest} from '../helpers/assembly.js';
import {fonts} from '../docx/helpers.js';
const take=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
const legacy=(version:number)=>({definition:JSON.parse(readFileSync('tests/template/fixtures/legacy-rejection/'+version+'-template.json','utf8')),fingerprint:'legacy-test-pin'});
const request=(version:number)=>JSON.parse(readFileSync('tests/template/fixtures/legacy-rejection/'+version+'-request.json','utf8'));
it.each(['globalBand','missingTocScope'])('rejects retired resolved shape %s consistently in both renderers',kind=>{
 const t=assemblyTemplate(),v=take(validateTemplate(t)),d:any=take(composeDocument(v,take(prepareGeneration(v,assemblyRequest(t)))));
 const owner=d.sections[0].sectionId;
 if(kind==='globalBand')d.sections[0].header={baseTextStyleId:'body',rootIds:['headerText'],nodes:{headerText:{id:'headerText',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'headerLeaf',type:'text',text:'HEADER'}]}},sourceMap:{headerText:{origin:'authored',sectionId:owner,sourceId:'headerText'},headerLeaf:{origin:'authored',sectionId:owner,sourceId:'headerLeaf'}}};
 else {d.nodes.testToc={id:'testToc',type:'table-of-contents',props:{textStyleId:'body',scope:{kind:'document'}}};d.sourceMap.testToc={origin:'authored',sectionId:owner,sourceId:'testToc'};d.sections[0].rootIds.unshift('testToc');d.rootIds.unshift('testToc');}
 const resources={images:[],fonts:fonts().fonts.map((f:any,i:number)=>({id:f.id,legacyAlias:['regular','bold','italic','boldItalic'][i],weight:i===1||i===3?700:400,style:i>=2?'italic':'normal',bytes:readFileSync(f.path),sha256:f.sha256,license:{bytes:readFileSync(f.licenses[0].path),sha256:f.licenses[0].sha256}}))};
 expect(validateResolvedDocument(d)).toEqual([]);expect(preflightDocx(d,resources).ok).toBe(true);
 if(kind==='globalBand')d.header=structuredClone(d.sections.find((s:any)=>s.header).header);
 else for(const n of Object.values(d.nodes) as any[])if(n.type==='table-of-contents')delete n.props.scope;
 expect(validateResolvedDocument(d).length).toBeGreaterThan(0);expect(preflightDocx(d,resources).ok,'malformed model20 input must be rejected').toBe(false);
});
const value=(v:any):any=>({async kind(){return Array.isArray(v)?'array':v&&typeof v==='object'?'object':'scalar'},async scalar(){return v},async byteLength(){return Buffer.byteLength(JSON.stringify(v))},async *properties(){for(const[k,x]of Object.entries(v))yield[k,value(x)]},async *elements(){for(const x of v)yield value(x)}});
it.each([18,19])('rejects the formerly valid model%d template at public validation',version=>{expect(validateTemplate(legacy(version).definition).ok).toBe(false);});
it.each([18,19])('rejects a forged validated model%d before preparation',version=>{expect(prepareGeneration(legacy(version),request(version)).ok).toBe(false);});
it.each([18,19])('rejects model%d before task traversal, output or image callbacks',async version=>{
 let reads=0,writes=0,images=0;
 const unread:any={async kind(){reads++;throw Error('Legacy input must not be traversed')},async byteLength(){reads++;return 0},async scalar(){reads++;return null},async *properties(){reads++;},async *elements(){reads++;}};
 const normalized=await normalizeTaskInput(legacy(version),unread,{write:async()=>{writes++},images:{collect:async()=>{images++},seal:async()=>{images++},resolve:async()=>{images++;throw Error('Legacy images must not resolve')}}});
 expect(normalized.ok).toBe(false);expect(reads).toBe(0);expect(writes).toBe(0);expect(images).toBe(0);
 const composed=await composeTaskDocument(legacy(version),unread);expect(composed.ok).toBe(false);expect(reads).toBe(0);
});
it.each([18,19])('rejects model%d resolved input in shared PDF validation and DOCX preflight',version=>{
 const t=assemblyTemplate(),v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,assemblyRequest(t)))));d.nodeModelVersion=version;
 for(const s of d.sections){delete s.definitionId;delete s.instanceKey;delete s.sectionKey;}
 expect(validateResolvedDocument(d).some(i=>i.path==='nodeModelVersion')).toBe(true);
 const resources={images:[],fonts:fonts().fonts.map((f:any,i:number)=>({id:f.id,legacyAlias:['regular','bold','italic','boldItalic'][i],weight:i===1||i===3?700:400,style:i>=2?'italic':'normal',bytes:readFileSync(f.path),sha256:f.sha256,license:{bytes:readFileSync(f.licenses[0].path),sha256:f.licenses[0].sha256}}))};
 expect(preflightDocx(d,resources).ok).toBe(false);
});
it.each(['definitionId','instanceKey','sectionKey','ownerMismatch','duplicateInstance'])('rejects invalid model20 identity %s in both rendering validators',field=>{
 const t=assemblyTemplate(),v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,assemblyRequest(t)))));
 const resources={images:[],fonts:fonts().fonts.map((f:any,i:number)=>({id:f.id,legacyAlias:['regular','bold','italic','boldItalic'][i],weight:i===1||i===3?700:400,style:i>=2?'italic':'normal',bytes:readFileSync(f.path),sha256:f.sha256,license:{bytes:readFileSync(f.licenses[0].path),sha256:f.licenses[0].sha256}}))};
 expect(preflightDocx(d,resources).ok).toBe(true);
 if(field==='ownerMismatch')d.sections[0].sectionId='instance-other';
 else if(field==='duplicateInstance'){d.sections[1].sectionId=d.sections[0].sectionId;d.sections[1].instanceKey=d.sections[0].instanceKey;}
 else delete d.sections[0][field];
 expect(validateResolvedDocument(d).length).toBeGreaterThan(0);expect(preflightDocx(d,resources).ok).toBe(false);
});
it('keeps model20 composition and normalized2 task input working, rejects old prepared/normalized contracts',async()=>{
 const t=assemblyTemplate(),v=take(validateTemplate(t)),q=assemblyRequest(t),p=take(prepareGeneration(v,q)),d=take(composeDocument(v,p));let text='';
 take(await normalizeTaskInput(v,value({data:q.data,sections:q.sections}),{write:async s=>{text+=s},images:{collect:async()=>{},seal:async()=>{},resolve:async()=>{throw Error('No image')}}}));
 const n=JSON.parse(text);expect(n.contract).toBe('flowdoc-task-input/2');expect(take(await composeTaskDocument(v,value(n)))).toEqual(d);
 for(const schemaVersion of [1,2]){const old=structuredClone(p);old.schemaVersion=schemaVersion;expect(composeDocument(v,old).ok).toBe(false);}
 n.contract='flowdoc-task-input/1';expect((await composeTaskDocument(v,value(n))).ok).toBe(false);
});
