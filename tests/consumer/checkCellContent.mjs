import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {loadBundledResources,createPdfEngine} from '@flowdoc/core';
const ok=r=>{assert(r.ok,JSON.stringify(r));return r.value;};
const d=JSON.parse(await readFile('/consumer/four-styles.resolved.json','utf8'));
d.nodeModelVersion=9;d.rootIds=['toc','table','after'];d.nodes={};d.sourceMap={};
const add=n=>{d.nodes[n.id]=n;d.sourceMap[n.id]={contentIndex:0,format:'cell-proof',sourceId:n.id};};
const style=Object.keys(d.styles)[0];
const text=(id,value,props={})=>add({id,type:'text-block',role:{role:'paragraph'},props:{textStyleId:style,...props},children:[{id:id+'-leaf',type:'text',text:value}]});
add({id:'toc',type:'table-of-contents',props:{textStyleId:style}});
text('after','H001 สรุปผลหลังตาราง',{anchorId:'summary',toc:{level:1}});
add({id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true},columns:[{width:{value:90,unit:'pt'}},{width:{value:350,unit:'pt'}}],rowIds:['header']});
text('ht','หลักฐานการทดสอบ / Mixed cell content');
add({id:'header',type:'table-row',props:{allowBreak:false},cellIds:['hc']});
add({id:'hc',type:'table-cell',props:{columnIndex:0,colSpan:2},childIds:['ht']});
for(let i=0;i<12;i++){
 const rid='r'+i,a='a'+i,b='b'+i,desc='desc'+i,pic='pic'+i,caption='caption'+i;
 const spanStart=i===2,covered=i===3;
 d.nodes.table.rowIds.push(rid);
 add({id:rid,type:'table-row',props:{allowBreak:true},cellIds:covered?[b]:[a,b]});
 if(!covered){text(a+'text','REQ-'+String(i+1).padStart(3,'0'));add({id:a,type:'table-cell',props:{columnIndex:0,...(spanStart?{rowSpan:2}:{})},childIds:[a+'text']});}
 text(desc,`BEGIN-${i} ตรวจสอบการแสดงข้อมูลและภาพหลักฐาน\n`+'ระบบต้องแสดงข้อมูลภาษาไทยอย่างถูกต้องและรักษาลำดับของเนื้อหา '.repeat(i===4?100:3));
 add({id:pic,type:'image',props:{width:{value:180,unit:'pt'},height:{value:100,unit:'pt'},align:['left','center','right'][i%3],resourceId:'image'+i%3}});
 text(caption,`END-${i} คำบรรยายภาพหลักฐาน`);
 add({id:b,type:'table-cell',props:{columnIndex:1,padding:i===0?{top:{value:0,unit:'pt'},left:{value:0,unit:'pt'},bottom:{value:0,unit:'pt'},right:{value:0,unit:'pt'}}:{left:{value:2,unit:'mm'}}},childIds:[desc,pic,caption]});
}
const map={image0:{kind:'rgb',width:2,height:1,bytes:new Uint8Array([20,90,160,40,150,210])},image1:{kind:'rgb',width:1,height:2,bytes:new Uint8Array([40,130,60,100,180,90])},image2:{kind:'rgb',width:2,height:2,bytes:new Uint8Array([180,80,20,210,120,30,180,80,20,210,120,30])}};
const engine=ok(await createPdfEngine(ok(await loadBundledResources({pythonExecutable:'/usr/local/bin/python',tempRoot:'/consumer/temp'}))));
const result=await engine.generatePdf(d,map),pdf=ok(result);assert.equal(result.warnings.length,0);assert(pdf.pageCount>2);
const raw=Buffer.from(pdf.bytes).toString('latin1');assert.equal((raw.match(/\/Subtype \/Image/g)??[]).length,3);assert((raw.match(/\/Dest \[/g)??[]).length>=2);
await writeFile('/consumer/output/cell-content.pdf',pdf.bytes);
await writeFile('/consumer/output/cell-content.resolved.json',JSON.stringify(d,null,2));
await writeFile('/consumer/output/cell-content-result.json',JSON.stringify({status:'PASS',pageCount:pdf.pageCount,rows:12,images:12,resources:3,visualAcceptance:'pending'},null,2));
