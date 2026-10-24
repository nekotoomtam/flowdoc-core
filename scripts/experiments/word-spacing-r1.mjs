// Bounded artifact experiment. Uses measured Word line boxes for the frozen SRS
// introduction only; no default renderer change and no general font guarantee.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fontDescent,bottomBaseline,nominalLatin}from'./font-baseline-probe.mjs';
const require=createRequire(import.meta.url),root=process.env.PROBE_DIST??'/proof/dist';
const api=await import(root+'/index.js');
const {createEngine}=await import(root+'/pdf/createPdfEngine.js');
const {createTextRuntime}=await import(root+'/runtime/textRuntime.js');
const {subsetFonts}=await import(root+'/runtime/subsetFonts.js');
const {writePdf}=await import(root+'/pdf/writePdf.js');
const {SourceFontMetrics}=await import(root+'/docx/source-layout-font.js');
const I='/srs',O=process.env.PROBE_OUT??'/proof',sha=b=>createHash('sha256').update(b).digest('hex');
const take=r=>{if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
const document=JSON.parse(await fs.readFile(I+'/resolved-document.json','utf8'));
const calibration=JSON.parse(await fs.readFile(O+'/calibration.json','utf8'));
const section=document.sections.find(s=>s.sectionId==='introduction');
const ids=new Set(Object.entries(document.sourceMap).filter(([,s])=>s.sectionId===section.sectionId).map(([id])=>id));
const tables=new Set(Object.values(document.nodes).filter(n=>ids.has(n.id)&&n.type==='table'&&n.props.headerRowCount===0&&n.rowIds.every(id=>document.nodes[id].cellIds.every(c=>(document.nodes[c].props.rowSpan??1)===1))).map(n=>n.id));
const meetingTables=new Set(Object.values(document.nodes).filter(n=>ids.has(n.id)&&n.type==='table'&&n.props.headerRowCount===1&&n.props.repeatHeaderRows===true).map(n=>n.id));
const guided=new Set(calibration.sourceGuidedNodeIds??[]);
const textIds=new Set(Object.values(document.nodes).filter(n=>ids.has(n.id)&&!guided.has(n.id)&&n.type==='text-block'&&n.props.heightMode!=='fixed'&&n.children.every(c=>c.type==='text'||c.type==='line-break')).map(n=>n.id));
const prepared=JSON.parse(await fs.readFile(I+'/image-provider.json','utf8'));
const provider={contract:api.PDF_STREAM_CONTRACT,images:prepared,async*open(ref){const b=await fs.readFile(I+'/streams/'+ref.key);if(sha(b)!==ref.sha256)throw Error('Image hash changed');for(let at=0;at<b.length;at+=65536)yield b.subarray(at,at+65536);}};
await fs.mkdir('/tmp/spacing-resources',{recursive:true});
const resources=take(await api.loadBundledResources({pythonExecutable:'python',tempRoot:'/tmp/spacing-resources'}));
const fontDescents=new Map(await Promise.all(resources.fonts.map(async f=>[f.id,fontDescent(await fs.readFile(f.path))])));
const baselineGoal=process.argv.includes('--baseline-goal');
const nominalGoal=process.argv.includes('--nominal-goal');
const scopedGoal=process.argv.includes('--scoped-goal');
const fontMetrics=new Map(await Promise.all(resources.fonts.map(async f=>[f.id,new SourceFontMetrics(await fs.readFile(f.path))])));
const bodyTextIds=new Set(Object.entries(document.nodes).filter(([id,n])=>document.sourceMap[id]?.sectionId==='body'&&n.type==='text-block'&&!guided.has(id)).map(([id])=>id));
const meeting=process.argv.includes('--meeting');
const grouping=process.argv.includes('--grouping');
const rows=process.argv.includes('--rows'),nativeRowIds=new Set(calibration.nativeRowTableIds??[]);
const footer=process.argv.includes('--footer');
const widow=process.argv.includes('--widow'),nativeWidowIds=new Set(calibration.nativeWidowNodeIds??[]);
const topStart=process.argv.includes('--top-start');
const topHalf=process.argv.includes('--top-half');
const paddingCut=process.argv.includes('--padding-cut');
const nativeHeadingIds=new Set(calibration.nativeKeepNextHeadingIds??[]);
const modes=grouping?[['G0-M2-control',true,true,true,1.5,false],['G1-table-start',true,true,true,1.5,true]]:meeting?[['M1-paragraph',true,true,true,1],['M2-boundary',true,true,true,1.5]]:process.argv.includes('--final')?[['C2-combined',true,true,true]]:[['control',false,false,false],['H-header',true,false,false],['B-border',true,true,false],['L-linebox',true,false,true],['C-combined',true,true,true]];
const rowModes=[['R0-G1-control',true,true,true,1.5,true,0],['R1-border',true,true,true,1.5,true,1],['R2-twips',true,true,true,1.5,true,2]];
const footerModes=[['F0-R2-control',true,true,true,1.5,true,2,false],['F1-native-bottom',true,true,true,1.5,true,2,true]];
const widowModes=[['V0-E9-control',true,true,true,1.5,true,2,true,false],['V1-paragraph-minimum',true,true,true,1.5,true,2,true,true]];
const topModes=[['T0-E11-control',true,true,true,1.5,true,2,true,true,0],['T1-native-top',true,true,true,1.5,true,2,true,true,1],['T2-top-stroke',true,true,true,1.5,true,2,true,true,2]];
for(const [name,header,border,line,gap=0,keepStart=false,rowMode=0,nativeBottom=false,paragraphMinimum=false,topMode=0,baselineMode=false]of scopedGoal?[['S3-scoped-font-policy',true,true,true,1.5,true,2,true,true,3,true]]:nominalGoal?[['S2-font-nominal',true,true,true,1.5,true,2,true,true,3,true]]:baselineGoal?[['S0-E12-control',true,true,true,1.5,true,2,true,true,3,false],['S1-font-baseline',true,true,true,1.5,true,2,true,true,3,true]]:paddingCut?[['K1-padding-cut',true,true,true,1.5,true,2,true,true,0],['K2-padding-half-top',true,true,true,1.5,true,2,true,true,3]]:topHalf?[['T3-top-half-stroke',true,true,true,1.5,true,2,true,true,3]]:topStart?topModes:widow?widowModes:footer?footerModes:rows?rowModes:modes){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);
 const chunks=[];const engine=createEngine(resources,{runtime:(r,signal)=>{
  const native=createTextRuntime(r,signal);
  if(nominalGoal){const shape=native.shape.bind(native);native.shape=async(text,font,size)=>nominalLatin(await shape(text,font,size),text,fontMetrics.get(font),size);}
  if(header||border||line)native.spacingProbe={
   bodyTopPt:id=>topMode&&id===calibration.nativeBodyStart.sectionId?calibration.nativeBodyStart.bodyTopPt+(topMode===2?calibration.nativeBodyStart.tableStrokePt:topMode===3?calibration.nativeBodyStart.tableStrokePt/2:0):header&&id===section.sectionId?calibration.tableTopPt:undefined,
   bodyBottomPt:id=>nativeBottom&&id===calibration.nativeBottom?.sectionId?calibration.nativeBottom.bodyBottomPt:undefined,
   rowStrokePt:id=>border&&tables.has(id)?calibration.strokePt:undefined,
   tableBoundaryPt:(a,b)=>gap&&meetingTables.has(a)&&meetingTables.has(b)?gap:undefined,
   keepTableStart:id=>keepStart&&nativeHeadingIds.has(id),
   paragraphWidowOrphan:id=>paragraphMinimum&&nativeWidowIds.has(id),
   baselineOffsetPt:(id,style,height,shape)=>baselineMode&&bodyTextIds.has(id)?bottomBaseline(height,style.fontSize.value,fontDescents.get(native.fontId(style)),shape):undefined,
   shapedText:(id,text,font,size,shape)=>scopedGoal&&bodyTextIds.has(id)?nominalLatin(shape,text,fontMetrics.get(font),size):shape,
   nativeTableBox:id=>rowMode&&nativeRowIds.has(id)?{borderPt:.5,quantizeTextToTwips:rowMode===2}:undefined,
   lineBox:(id,style)=>{if(!line||!textIds.has(id)||style.fontFamilyKey!=='sarabun')return;
    const metric=calibration.lineProfiles[style.fontWeight+':'+style.fontSize.value+':'+style.lineHeightPt];return metric;
   }};
  return native;
 },subset:async(draw,...args)=>{
  if(meeting||grouping||rows||footer||widow||topStart||topHalf||paddingCut||baselineGoal||nominalGoal||scopedGoal)await fs.writeFile(O+'/'+name+'-draw.json',JSON.stringify(draw.pages.map((p,page)=>({page:page+1,runs:p.commands.map(c=>({nodeId:c.nodeId,text:c.text,x:c.bounds.xPt,y:c.bounds.yPt,baseline:c.bounds.yPt+c.baselineOffsetPt,height:c.bounds.heightPt,glyphCount:c.glyphs.length}))}))),{flag:'wx'});
  return subsetFonts(draw,...args);
 },write:writePdf});
 let result;try{result=await engine.generatePdfTo(document,provider,{async write(b){chunks.push(Buffer.from(b));},async abort(){chunks.length=0;}},{signal:controller.signal});}finally{clearTimeout(timer);}
 await fs.writeFile(O+'/'+name+'-result.json',JSON.stringify(result,null,2),{flag:'wx'});
 if(!result.ok)throw Error(name+': '+JSON.stringify(result));
 const bytes=Buffer.concat(chunks);if(sha(bytes)!==result.value.sha256)throw Error('PDF hash mismatch');
 await fs.writeFile(O+'/SRS-'+name+'.pdf',bytes,{flag:'wx'});
 console.log(name,result.value.pageCount,bytes.length,sha(bytes));
}
await fs.writeFile(O+(scopedGoal?'/scope-scoped-goal.json':nominalGoal?'/scope-nominal-goal.json':baselineGoal?'/scope-baseline-goal.json':paddingCut?'/scope-padding-cut.json':topHalf?'/scope-top-half.json':topStart?'/scope-top-start.json':widow?'/scope-widow.json':footer?'/scope-footer.json':rows?'/scope-rows.json':grouping?'/scope-grouping.json':meeting?'/scope-meeting.json':process.argv.includes('--final')?'/scope-r2.json':'/scope.json'),JSON.stringify({section:scopedGoal?'E12 plus body-only font baseline and nominal ASCII advances':nominalGoal?'E12 plus ink-safe baseline and nominal ASCII advances':baselineGoal?'E12 geometry plus font-descent baseline, ink safe':paddingCut?'E11 paragraph-cut padding correction with isolated native half-stroke top':topHalf?'E11 profile plus native body margin and half-stroke envelope':topStart?'E11 profile plus native body-start margin and table stroke':widow?'E9 profile plus native body paragraph widow/orphan minimum':footer?'E8 profile plus native body bottom capacity':rows?'E7 profile plus native requirement-row footprint':grouping?'M2 introduction profile plus body heading/table-start grouping':'introduction',textNodes:textIds.size,tables:tables.size,meetingTables:meetingTables.size,nativeHeadingIds:grouping||rows||footer||widow||topStart||topHalf||paddingCut||baselineGoal||nominalGoal||scopedGoal?nativeHeadingIds.size:0,nativeRowTableIds:rows||footer||widow||topStart||topHalf||paddingCut||baselineGoal||nominalGoal||scopedGoal?[...nativeRowIds]:[],nativeWidowNodeIds:widow||topStart||topHalf||paddingCut||baselineGoal||nominalGoal||scopedGoal?[...nativeWidowIds]:[],documentSha256:sha(JSON.stringify(document)),calibration,defaultUnchanged:true,publicApiUnchanged:true,ruleAcceptance:false},null,2),{flag:'wx'});
