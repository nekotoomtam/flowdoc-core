import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const definition=JSON.parse(await readFile('/consumer/row-groups-template.json','utf8'));
const request=JSON.parse(await readFile('/consumer/row-groups-request.json','utf8'));
const template=ok(validateTemplate(definition));
const document=ok(composeDocument(template,ok(prepareGeneration(template,request))));
const table=document.nodes[document.rootIds[0]];
assert.equal(table.rowGroups.length,2);
const texts=table.rowIds.map(id=>document.nodes[document.nodes[document.nodes[id].cellIds[0]].childIds[0]].children.map(c=>c.text).join(''));
assert.deepEqual(texts,['before','Company A','labels','Person A','Person B','Company B','labels','empty','after']);
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const pdf=ok(await engine.generatePdf(JSON.parse(JSON.stringify(document))));assert.equal(pdf.pageCount,1);
await writeFile('/consumer/output/row-groups.pdf',pdf.bytes);
definition.areaFormats.meeting.rowGroups[0].pagination.keepStart=true;
const pending=ok(validateTemplate(definition)),d=ok(composeDocument(pending,ok(prepareGeneration(pending,request))));
const kept=await engine.generatePdf(d);assert.equal(kept.ok,true);assert.deepEqual(kept.warnings,[]);
const format=definition.areaFormats.meeting;format.fragment.nodes.labelsText.children[0].text=Array(80).fill('Tall prefix').join('\n');
const oversized=ok(validateTemplate(definition)),longDoc=ok(composeDocument(oversized,ok(prepareGeneration(oversized,request))));
const relaxed=await engine.generatePdf(longDoc);assert.equal(relaxed.ok,true);assert.equal(relaxed.warnings.length,2);assert(relaxed.warnings.every(w=>w.code==='ROW_GROUP_KEEP_START_RELAXED'&&w.groupId==='companies'));
await writeFile('/consumer/output/row-groups-fallback.pdf',relaxed.value.bytes);
// Stage1 exercises the public packed composition API only; continuation layout is Stage2.
const labels=JSON.parse(await readFile('/consumer/row-groups-template.json','utf8'));
labels.nodeModelVersion=19;
const section=labels.sections[0];section.id='10000000-0000-4000-8000-000000000011';section.label='Results 1';section.nameBase='Results';delete section.key;delete section.formats;
const lf=labels.areaFormats.meeting,ln=lf.fragment.nodes;
lf.inputSchema.fields.companies.items.fields.name.allowEmpty=false;
for(const row of ['company','labels'])for(const id of [row,row+'Cell',row+'Text'])delete ln[id];
ln.table.rowIds=['before','member','empty','after'];ln.table.columns=[{width:{value:80,unit:'pt'}},{width:{value:120,unit:'pt'}}];
for(const row of ln.table.rowIds)ln[row+'Cell'].props={columnIndex:0,colSpan:2};
for(const row of ['member','empty']){
 ln[row+'Cell'].props={columnIndex:1};ln[row].cellIds.unshift(row+'LabelCell');
 ln[row+'LabelCell']={id:row+'LabelCell',type:'table-cell',props:{columnIndex:0},childIds:[row+'LabelText']};
 ln[row+'LabelText']={id:row+'LabelText',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:row+'LabelRef',type:'field-ref',scope:'group',key:'name'}]};
}
ln.empty.props.allowBreak=false;
lf.rowGroups[0].rowTemplateIds=['member','empty'];delete lf.rowGroups[0].pagination;
lf.rowGroups[0].groupLabel={cellTemplateId:'memberLabelCell',emptyCellTemplateId:'emptyLabelCell'};
const labelTemplate=ok(validateTemplate(labels));
const labelRequest={docKey:labels.docKey,data:{},sections:[{id:section.id,data:{details:[{format:'meeting',data:{companies:[{name:'Same\nA',members:[{name:'A'},{name:'B'}]},{name:'Same\nA',members:[]}]}}]}}]};
const labelDoc=ok(composeDocument(labelTemplate,ok(prepareGeneration(labelTemplate,labelRequest))));
const labelGroups=labelDoc.nodes[labelDoc.rootIds[0]].rowGroups;
assert.deepEqual(labelGroups.map(g=>[g.groupIndex,g.groupLabel.memberCount]),[[0,2],[1,0]]);
assert.equal(labelDoc.nodes[labelGroups[0].groupLabel.cellId].props.rowSpan,2);
assert.equal(labelDoc.sourceMap[labelGroups[0].groupLabel.cellId].itemIndex,undefined);
for(const g of labelGroups){const cell=labelDoc.nodes[g.groupLabel.cellId],text=labelDoc.nodes[cell.childIds[0]];assert.equal(text.children.map(c=>c.type==='line-break'?'\n':c.text).join(''),'Same\nA');}
await writeFile('/consumer/output/group-labels.resolved.json',JSON.stringify(labelDoc));
const labelCases=[];
async function labelCase(name,groups,{fixed=false,bands=false,protectedRows=false,height=180}={}){
 const def=structuredClone(labels),f=def.areaFormats.meeting,section=def.sections[0],page=def.pageLayouts[def.book.defaultPageLayoutId].page;
 page.margin.top={value:10,unit:'pt'};page.margin.bottom={value:297*72/25.4-10-height,unit:'pt'};
 f.fragment.nodes.table.props.headerRowCount=1;f.fragment.nodes.table.props.repeatHeaderRows=true;
 if(protectedRows)f.fragment.nodes.member.props.allowBreak=false;
 if(fixed)f.sizing={mode:'fixed',height:{value:300,unit:'pt'}};
 if(bands)for(const kind of ['header','footer'])section[kind]={
  baseTextStyleId:'body',inputSchema:{type:'object',fields:{}},sizing:{mode:'fixed',height:{value:20,unit:'pt'}},gap:{value:4,unit:'pt'},
  fragment:{rootIds:[kind],nodes:{[kind]:{id:kind,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:kind+'-leaf',type:'text',text:kind.toUpperCase()}]}}}
 };
 const req={docKey:def.docKey,data:{},sections:[{id:section.id,data:{details:[{format:'meeting',data:{companies:groups}}]},...(bands?{header:{},footer:{}}:{})}]};
 const tpl=ok(validateTemplate(def)),resolved=ok(composeDocument(tpl,ok(prepareGeneration(tpl,req)))),result=await engine.generatePdf(resolved);
 if(name==='impossible'){
  assert.equal(result.ok,false);assert(result.issues.some(i=>i.code==='LAYOUT_FAILED'&&i.reason==='group-label-does-not-fit'&&i.groupId==='companies'&&i.groupIndex===0));
  labelCases.push({name,status:'PASS',expectedFailure:result.issues});return;
 }
 const artifact=ok(result);if(!fixed)assert(artifact.pageCount>1);else{assert.equal(artifact.pageCount,1);assert(result.warnings.some(w=>w.code==='FORMAT_CONTENT_OMITTED'));}
 await writeFile('/consumer/output/group-label-'+name+'.pdf',artifact.bytes);
 await writeFile('/consumer/output/group-label-'+name+'.resolved.json',JSON.stringify(resolved));
 labelCases.push({name,status:'PASS',pageCount:artifact.pageCount,warnings:result.warnings,members:groups.flatMap(g=>g.members.map(m=>m.name)),labels:groups.map(g=>g.name)});
}
await labelCase('groups',[0,1].map(g=>({name:'กลุ่ม A',members:Array.from({length:8},(_,i)=>({name:`G${g}R${i}`}))})),{bands:true,height:200});
await labelCase('long',[{name:'กลุ่ม A',members:[{name:Array.from({length:24},(_,i)=>'L'+String(i).padStart(2,'0')).join('\n')}]}]);
await labelCase('multiline',[{name:'Group A\nงานทดสอบ',members:Array.from({length:15},(_,i)=>({name:'M'+String(i).padStart(2,'0')}))}]);
await labelCase('fixed',[{name:'กลุ่ม A',members:Array.from({length:12},(_,i)=>({name:'F'+String(i).padStart(2,'0')}))}],{fixed:true,height:120});
await labelCase('protected',[{name:'Top\nMid\nBot',members:Array.from({length:6},(_,i)=>({name:'P'+String(i).padStart(2,'0')}))}],{protectedRows:true,height:100});
await labelCase('fixed-protected',[{name:'Top\nMid\nBot',members:Array.from({length:6},(_,i)=>({name:'Q'+String(i).padStart(2,'0')}))}],{fixed:true,protectedRows:true,height:100});
await labelCase('impossible',[{name:Array(9).fill('NAME').join('\n'),members:[]}],{height:100});
await writeFile('/consumer/output/group-label-cases.json',JSON.stringify(labelCases,null,2));
await writeFile('/consumer/output/row-groups-result.json',JSON.stringify({status:'PASS',pageCount:pdf.pageCount,groups:2,rows:texts.length,keepStart:'supported',fallbackWarnings:relaxed.warnings,groupLabelSpans:{stage:2,composition:'PASS',memberCounts:[2,0],multiline:true,layout:'PASS',cases:labelCases}},null,2));
