import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.value;};
const template=ok(validateTemplate(await readFile('/consumer/contents-template.json','utf8'))),resources=ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'})),engine=ok(await createPdfEngine(resources));
const results=[];
for(const [name,count,bodyLines,atEnd] of [['short',3,1,false],['empty',0,0,false],['long',50,2,false],['reflow',3,65,false],['after',3,20,true],['wrapped',1,0,false]]){
 const sections=Array.from({length:count},(_,i)=>({format:i%3===0?'section':`section${i%3+1}`,data:{anchor:'h'+i,heading:`H${String(i).padStart(3,'0')} หัวข้อเอกสาร / Section ${i+1}`+(name==='wrapped'?' หัวข้อยาว'.repeat(800):''),body:Array.from({length:bodyLines},(_,j)=>`เนื้อหา ${i+1} บรรทัดที่ ${j+1}`).join('\n')}}));
 const contents={format:'contents',data:{}},request={docKey:template.definition.docKey,data:{},content:atEnd?[...sections,contents]:[contents,...sections]},d=ok(composeDocument(template,ok(prepareGeneration(template,request)))),pdf=ok(await engine.generatePdf(d));
 const text=Buffer.from(pdf.bytes).toString('latin1'),links=(text.match(/\/Dest \[/g)??[]).length;assert(links>=count*2);assert(name!=='long'||pdf.pageCount>2);assert(name!=='wrapped'||pdf.pageCount>2);
 await writeFile(`/consumer/output/contents-${name}.pdf`,pdf.bytes);await writeFile(`/consumer/output/contents-${name}.resolved.json`,JSON.stringify(d,null,2));results.push({name,pageCount:pdf.pageCount,entries:count,links});
}

const tableDoc=ok(composeDocument(template,ok(prepareGeneration(template,{docKey:template.definition.docKey,data:{},content:[{format:'contents',data:{}},{format:'section',data:{anchor:'table-heading',heading:'H000 หัวตาราง / Table heading',body:'ข้อมูลในตาราง\n'.repeat(60)}}]}))));
const heading=tableDoc.rootIds[2],body=tableDoc.rootIds[3];tableDoc.rootIds.splice(2,2,'table');
tableDoc.nodes.table={id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true},columns:[{width:{value:450,unit:'pt'}}],rowIds:['header-row','body-row']};
for(const [name,child] of [['header',heading],['body',body]]){tableDoc.nodes[name+'-row']={id:name+'-row',type:'table-row',props:{allowBreak:true},cellIds:[name+'-cell']};tableDoc.nodes[name+'-cell']={id:name+'-cell',type:'table-cell',props:{},childIds:[child]};}
for(const id of ['table','header-row','body-row','header-cell','body-cell'])tableDoc.sourceMap[id]={contentIndex:1,format:'section',sourceId:id};
const tablePdf=ok(await engine.generatePdf(tableDoc));assert(tablePdf.pageCount>1);const tableText=Buffer.from(tablePdf.bytes).toString('latin1');assert.equal((tableText.match(/\/Dest \[/g)??[]).length,2);await writeFile('/consumer/output/contents-table.pdf',tablePdf.bytes);await writeFile('/consumer/output/contents-table.resolved.json',JSON.stringify(tableDoc,null,2));results.push({name:'table',pageCount:tablePdf.pageCount,entries:1,links:2});
await writeFile('/consumer/output/contents-result.json',JSON.stringify({status:'PASS',interactiveActivation:'pending',results},null,2));
