import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {validateTemplate,prepareGeneration,composeDocument,loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const base=JSON.parse(await readFile('/consumer/page-numbering-template.json','utf8'));
const request=JSON.parse(await readFile('/consumer/page-numbering-request.json','utf8'));
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const images={'22222222-2222-4222-8222-222222222222':{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])}};
const heading=(id,label,level=1)=>({id,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:id,toc:{level}},children:[{id:id+'-text',type:'text',text:label}]});
const results=[];
for(const [name,count,lines] of [['short',3,2],['long',70,60]]){
 const t=structuredClone(base),r=structuredClone(request),body=t.sections.find(s=>s.key==='body');body.numbering={mode:'restart',startAt:1};
 const h=heading('heading','');h.props.anchorId={scope:'local',key:'anchor'};h.children=[{id:'label',type:'field-ref',scope:'local',key:'title'}];
 body.formats.heading={inputSchema:{type:'object',fields:{anchor:{type:'string',required:true},title:{type:'string',required:true}}},repeats:[],fragment:{rootIds:['heading'],nodes:{heading:h}}};
 const items=Array.from({length:count},(_,i)=>({format:'heading',data:{anchor:'H'+String(i).padStart(3,'0'),title:'H'+String(i).padStart(3,'0')+' หัวข้อทดสอบ '+(i===1?'ชื่อยาวภาษาไทย '.repeat(32):'')}}));
 r.sections.body.content.unshift(...items);
 const merged=body.formats.merged.fragment,table=Object.values(merged.nodes).find(n=>n.type==='table');
 const row=merged.nodes[table.rowIds[0]],cell=merged.nodes[row.cellIds[0]],text=merged.nodes[cell.childIds[0]];
 text.props={...text.props,anchorId:'H900',toc:{level:2}};text.children=[{id:'header-label',type:'text',text:'H900 หัวตารางที่แสดงซ้ำ'}];
 const area=t.areaFormats['format-003'];area.fragment.nodes.areaHeading=heading('areaHeading','H901 หัวข้อภายใน Area',3);area.fragment.rootIds.unshift('areaHeading');
 const evidence=r.sections.body.content.find(x=>x.format==='merged').data.details.find(x=>x.format==='evidence');evidence.data.caption='รายละเอียดหลักฐาน\n'.repeat(lines)+'จบรายการ';
 for(const [key,id,label] of [['hidden','H997','หัวข้อซ่อนเลขหน้า'],['excluded','H998','หัวข้อไม่นับเลขหน้า'],['closing','H999','ส่วนเริ่มเลขใหม่']]){
  const s=t.sections.find(s=>s.key===key);s.source.fragment.nodes.end=heading('end',id+' '+label);s.source.fragment.nodes.end.props.anchorId=id;
 }
 const v=ok(validateTemplate(t)),prepared=ok(prepareGeneration(v,r)),d=ok(composeDocument(v,prepared)),pdf=ok(await engine.generatePdf(d,images));
 await writeFile(`/consumer/output/contents-sections-${name}.pdf`,pdf.bytes);
 await writeFile(`/consumer/output/contents-sections-${name}.template.json`,JSON.stringify(t,null,2));
 await writeFile(`/consumer/output/contents-sections-${name}.request.json`,JSON.stringify(r,null,2));
 const invalid=structuredClone(r);invalid.sections.body.content[1].data.anchor='H000';assert.equal(composeDocument(v,ok(prepareGeneration(v,invalid))).ok,false);
 results.push({name,pageCount:pdf.pageCount,headings:count+6});
}
assert(results[1].pageCount>results[0].pageCount);
await writeFile('/consumer/output/contents-sections-result.json',JSON.stringify({status:'PASS',results},null,2));
