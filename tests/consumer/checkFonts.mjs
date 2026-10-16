import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,mkdir,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadBundledResources,loadLibraryFonts,createPdfEngine,validateTemplate,prepareGeneration,composeDocument} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;},sha=b=>createHash('sha256').update(b).digest('hex');
const uuid=(prefix,n)=>prefix+'0000000-0000-4000-8000-'+String(n).padStart(12,'0');
const list=async dir=>{const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await list(p));else if(/\.ttf$/i.test(e.name))out.push(p);}return out.sort();};
const paths=await list('/consumer/font-fixtures');
assert([4,29].includes(paths.length));
const base=ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}));
const input=[],records=[],families=new Map(),pdfs=[];
for(const [i,path] of paths.entries()){
 const m=JSON.parse(execFileSync(base.pythonExecutable,['-c',"from fontTools.ttLib import TTFont; import sys,json; f=TTFont(sys.argv[1]); print(json.dumps(dict(family=f['name'].getDebugName(16) or f['name'].getDebugName(1), weight=f['OS/2'].usWeightClass, style='italic' if (f['OS/2'].fsSelection & 1 or f['head'].macStyle & 2) else 'normal')))",path],{encoding:'utf8'}));
 const familyDir=dirname(path);if(!families.has(familyDir))families.set(familyDir,families.size+1);
 const releaseId=uuid('2',families.get(familyDir)),license=join(familyDir,'OFL.txt'),bytes=await readFile(path);
 const f={releaseId,faceId:uuid('3',i+1),assetId:uuid('4',i+1),weight:m.weight,style:m.style,path,sha256:sha(bytes),licenses:[{id:'fixture-license-'+families.get(familyDir),path:license,sha256:sha(await readFile(license))}]};
 input.push(f);records.push({file:path.replace('/consumer/',''),family:m.family,rawWeight:m.weight,style:m.style,sha256:f.sha256,...f});
}
const resources=ok(await loadLibraryFonts(base,input)),engine=ok(await createPdfEngine(resources));
const legacy=JSON.parse(await readFile('/consumer/four-styles.resolved.json','utf8')),page=legacy.book.page;
const selection=f=>({kind:'library',releaseId:f.releaseId,weight:f.weight,style:f.style});
function doc(f,label){
 const roots=['title','sample'],nodes={},sourceMap={};
 const textNode=(id,text,children)=>({id,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:children??[{id:id+'-text',type:'text',text}]});
 for(const [id,text] of [['title',label],['sample','ภาษาไทย กุ้ง น้ำ ปี่ ญู ฐาน\nFlowDoc ABC abc 0123456789\nคำอธิบาย ตรวจสระและวรรณยุกต์']]){
  nodes[id]=textNode(id,text);sourceMap[id]={origin:'authored',sectionId:'main',sourceId:id};sourceMap[id+'-text']={origin:'authored',sectionId:'main',sourceId:id+'-text'};
 }
 const band=(id,text,children)=>{const n=textNode(id,text,children),map={[id]:{origin:'authored',sectionId:'main',sourceId:id}};for(const c of n.children)map[c.id]={origin:'authored',sectionId:'main',sourceId:c.id};return {baseTextStyleId:'body',rootIds:[id],nodes:{[id]:n},sourceMap:map};};
 const header=band('header','ชุดทดสอบฟอนต์ ภาษาไทย English'),footer=band('footer','',[
  {id:'footer-label',type:'text',text:'หน้า '},{id:'current',type:'system-page-field',field:'current',width:{value:40,unit:'pt'}},{id:'footer-slash',type:'text',text:' / '},{id:'total',type:'system-page-field',field:'total',width:{value:40,unit:'pt'}}
 ]);
 return {schemaVersion:2,nodeModelVersion:18,template:{templateId:'font-proof',docKey:'font-proof',version:1},book:{contentSlot:'body',page},styles:{body:{font:selection(f),fontSize:{value:18,unit:'pt'},lineHeightPt:40}},rootIds:roots,nodes,sourceMap,sections:[{sectionId:'main',pageLayoutId:'normal',page,rootIds:roots,sourceKind:'authored',role:'body',headerMode:'all',footerMode:'all',header,footer}]};
}
for(const [i,f] of input.entries()){
 const name='font-face-'+String(i+1).padStart(2,'0'),label=records[i].family+' '+f.weight+' '+f.style,d=doc(f,label),before=JSON.stringify(d);
 const result=ok(await engine.generatePdf(d));assert.equal(result.pageCount,1);assert.equal(JSON.stringify(d),before);
 assert.equal(result.fontUsage.length,1);assert.equal(result.fontUsage[0].sha256,f.sha256);assert.deepEqual(result.fontUsage[0].selection,{releaseId:f.releaseId,faceId:f.faceId,assetId:f.assetId,weight:f.weight,style:f.style});
 await writeFile('/consumer/output/'+name+'.pdf',result.bytes);pdfs.push({name,pageCount:1,family:records[i].family,weight:f.weight,style:f.style,source:records[i].file,sha256:sha(result.bytes),fontUsage:result.fontUsage});
}
const sarabun=input.filter((f,i)=>records[i].family==='Sarabun');
assert(sarabun.length>=4);
const converted=structuredClone(legacy);converted.schemaVersion=2;
for(const [key,s] of Object.entries(converted.styles)){
 const f=sarabun.find(f=>f.weight===(s.fontWeight==='bold'?700:400)&&f.style===(s.fontStyle??'normal'));assert(f);
 converted.styles[key]={font:selection(f),fontSize:s.fontSize,lineHeightPt:s.lineHeightPt};
}
const convertedPdf=ok(await engine.generatePdf(converted));await writeFile('/consumer/output/sarabun-v2-four-styles.pdf',convertedPdf.bytes);
pdfs.push({name:'sarabun-v2-four-styles',pageCount:convertedPdf.pageCount,fontUsage:convertedPdf.fontUsage});
const regular=sarabun.find(f=>f.weight===400&&f.style==='normal'),second={...regular,releaseId:uuid('2',90),faceId:uuid('3',90)};
const extended=ok(await loadLibraryFonts(resources,[second])),mixedEngine=ok(await createPdfEngine(extended));
const t=JSON.parse(await readFile('/consumer/page-numbering-template.json','utf8')),r=JSON.parse(await readFile('/consumer/page-numbering-request.json','utf8'));
t.schemaVersion=2;
const byFamily=part=>input.find((f,i)=>records[i].family.includes(part)&&f.weight===400&&f.style==='normal')??regular;
const original=t.styles.body;
t.styles={body:{font:selection(byFamily('Pridi')),fontSize:original.fontSize,lineHeightPt:24},heading:{font:selection(regular),fontSize:original.fontSize,lineHeightPt:24},bands:{font:selection(byFamily('IBM')),fontSize:original.fontSize,lineHeightPt:24},numbers:{font:selection(second),fontSize:original.fontSize,lineHeightPt:24}};
for(const s of t.sections){
 for(const n of Object.values(s.source.fragment?.nodes??{}))if(n.type==='table-of-contents'||n.type==='text-block')n.props.textStyleId=n.type==='table-of-contents'||n.props.toc?'heading':'body';
 for(const name of ['header','footer'])if(s[name]){const style=name==='header'?'bands':'numbers';s[name].baseTextStyleId=style;for(const n of Object.values(s[name].fragment.nodes))if(n.type==='text-block')n.props.textStyleId=style;}
}
for(const f of Object.values(t.areaFormats??{}))for(const n of Object.values(f.fragment.nodes))if(n.type==='text-block')n.props.textStyleId='body';
for(const entry of r.sections.body.data.details)if(entry.data.caption)entry.data.caption='BEGIN-ROW\nทดสอบตารางด้วยฟอนต์ที่ตรึงไว้\nทดสอบสระและวรรณยุกต์\nEND-ROW';
const validated=ok(validateTemplate(t)),resolved=ok(composeDocument(validated,ok(prepareGeneration(validated,r)))),images={'22222222-2222-4222-8222-222222222222':{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])}};
const mixed=ok(await mixedEngine.generatePdf(resolved,images));assert(mixed.fontUsage.length>= (paths.length===29?4:2));assert(mixed.pageCount>=6);
assert(mixed.fontUsage.every(f=>f.selection));
await writeFile('/consumer/output/font-mixed-sections.pdf',mixed.bytes);pdfs.push({name:'font-mixed-sections',pageCount:mixed.pageCount,fontUsage:mixed.fontUsage});
extended.fonts.reverse();assert.deepEqual(ok(await mixedEngine.generatePdf(resolved,images)).bytes,mixed.bytes);
const bad=doc(regular,'Missing face');bad.styles.body.font={...selection(regular),weight:999};
assert.equal((await engine.generatePdf(bad)).issues[0].code,'FONT_FACE_UNAVAILABLE');
bad.styles.body.font={kind:'unselected'};assert.equal((await engine.generatePdf(bad)).issues[0].code,'FONT_NOT_SELECTED');
const missing=doc(regular,'Glyph');missing.nodes.sample.children[0].text='\u{1f984}';assert.equal((await engine.generatePdf(missing)).issues[0].code,'FONT_GLYPH_MISSING');
const corrupt=await loadLibraryFonts(base,[{...regular,sha256:'0'.repeat(64)}]);assert.equal(corrupt.ok,false);
await mkdir('/consumer/temp/latin-proof');
const latinPath='/consumer/temp/latin-proof/latin.ttf';
execFileSync(base.pythonExecutable,['-c',"from fontTools.ttLib import TTFont; from fontTools import subset; import sys; f=TTFont(sys.argv[1],recalcTimestamp=False); s=subset.Subsetter(); s.populate(text='English text only ABC abc 0123456789 '); s.subset(f); f.save(sys.argv[2])",regular.path,latinPath]);
const latin={...regular,releaseId:uuid('2',91),faceId:uuid('3',91),assetId:uuid('4',91),path:latinPath,sha256:sha(await readFile(latinPath))};
const latinResources=ok(await loadLibraryFonts({...base,fonts:[]},[latin])),latinEngine=ok(await createPdfEngine(latinResources));
const latinDoc=doc(latin,'English text only');delete latinDoc.sections[0].header;delete latinDoc.sections[0].footer;latinDoc.nodes.sample.children[0].text='English text only ABC abc 0123456789';
const latinPdf=ok(await latinEngine.generatePdf(latinDoc));await writeFile('/consumer/output/font-english-only.pdf',latinPdf.bytes);pdfs.push({name:'font-english-only',pageCount:latinPdf.pageCount,fontUsage:latinPdf.fontUsage});
const book=doc(input[0],'All faces');delete book.sections[0].header;delete book.sections[0].footer;book.styles={};book.nodes={};book.sourceMap={};book.rootIds=[];book.sections[0].rootIds=book.rootIds;
for(const [i,f] of input.entries()){const id='face-'+i,style='style-'+i;book.styles[style]={font:selection(f),fontSize:{value:10,unit:'pt'},lineHeightPt:20};book.rootIds.push(id);book.nodes[id]={id,type:'text-block',role:{role:'paragraph'},props:{textStyleId:style},children:[{id:id+'-text',type:'text',text:records[i].family+' '+f.weight+' '+f.style+' กุ้ง น้ำ 123'}]};for(const node of [id,id+'-text'])book.sourceMap[node]={origin:'authored',sectionId:'main',sourceId:node};}
const all=ok(await engine.generatePdf(book));assert.equal(all.fontUsage.length,input.length);await writeFile('/consumer/output/font-all-faces.pdf',all.bytes);pdfs.push({name:'font-all-faces',pageCount:all.pageCount,fontUsage:all.fontUsage});
await rm('/consumer/temp/latin-proof',{recursive:true});
assert.deepEqual(await readdir('/consumer/temp'),[]);
await writeFile('/consumer/output/fonts-result.json',JSON.stringify({status:'PASS',fixtureCount:paths.length,families:families.size,scope:'test-only raw weight bindings; no catalog activation',records:records.map(({path,licenses,...r})=>r),pdfs,checks:['all provided faces shaped and embedded','same-source hashes in fontUsage','body/table/header/footer/TOC/page fields','two releases and multiple families','immutable input and pinned resource selection','missing face/glyph and unselected block PDF','hash mismatch blocks','English-only face needs no Thai probe glyph','cleanup']},null,2));
