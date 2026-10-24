import {it,expect}from'vitest';
import {document,fakeRuntime}from'../helpers/document.js';
import {documentFlow}from'../../src/layout/documentFlow.js';
function fixture(rows=2,capacity=90){
 const d:any=document();d.rootIds.splice(0,d.rootIds.length,'pad','heading','table');
 d.book.page.margin.top={unit:'pt',value:0};d.book.page.margin.bottom={unit:'pt',value:297*72/25.4-capacity};
 const text=(id:string,value:string)=>({id,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:id+'leaf',type:'text',text:value}]});
 d.nodes.pad=text('pad','p\np\np');d.nodes.heading={...text('heading','Heading'),props:{textStyleId:'body',toc:{level:1}}};
 d.nodes.table={id:'table',type:'table',props:{headerRowCount:1,repeatHeaderRows:true},columns:[{width:{unit:'pt',value:100}}],rowIds:[]};
 for(let i=0;i<rows;i++){const r='row'+i,c='cell'+i,t='text'+i;d.nodes.table.rowIds.push(r);d.nodes[r]={id:r,type:'table-row',props:{allowBreak:true},cellIds:[c]};d.nodes[c]={id:c,type:'table-cell',props:{padding:{top:{unit:'pt',value:0},bottom:{unit:'pt',value:0},left:{unit:'pt',value:0},right:{unit:'pt',value:0}}},childIds:[t]};d.nodes[t]=text(t,i?'Body':'Header');}
 return d;
}
const probe:any={...fakeRuntime,spacingProbe:{keepTableStart:(id:string)=>id==='heading'}};
const pageOf=(flow:any,id:string)=>flow.pages.findIndex((p:any)=>p.commands.some((r:any)=>r.nodeId===id));
it('moves a heading with a whole header and first body line',async()=>{
 const d=fixture();const before=await documentFlow(d,fakeRuntime),after=await documentFlow(d,probe);
 expect(pageOf(before,'heading')).toBe(0);expect(pageOf(after,'heading')).toBe(1);
 expect(pageOf(after,'text0')).toBe(1);expect(pageOf(after,'text1')).toBe(1);
});
it('keeps an intervening description with the table start',async()=>{
 const d=fixture(2,110);d.nodes.desc={...d.nodes.pad,id:'desc',children:[{id:'descLeaf',type:'text',text:'Description\nsecond'}]};d.rootIds.splice(2,0,'desc');
 const f=await documentFlow(d,probe);expect(pageOf(f,'heading')).toBe(1);expect(pageOf(f,'desc')).toBe(1);expect(pageOf(f,'text1')).toBe(1);
});
it('keeps tall rows flowing and does not require the whole row to fit',async()=>{
 const d=fixture();d.nodes.text1.children[0].text=Array.from({length:30},(_,i)=>'L'+i).join('\n');
 const f=await documentFlow(d,probe);expect(pageOf(f,'heading')).toBe(1);expect(pageOf(f,'text1')).toBe(1);
 expect(f.pages.flatMap(p=>p.commands).filter(r=>r.nodeId==='text1').map(r=>r.text)).toEqual(Array.from({length:30},(_,i)=>'L'+i));expect(f.pages.length).toBeLessThan(15);
});
it('does not move an exactly fitting start group',async()=>{
 const d=fixture(2,108);const before=await documentFlow(d,fakeRuntime);expect(await documentFlow(d,probe)).toEqual(before);
});
it('fails once if a requested minimum group cannot fit a full page',async()=>{
 const d=fixture(2,40);d.nodes.pad.children[0].text='p';await expect(documentFlow(d,probe)).rejects.toThrow('group');
});
it('leaves non-selected headings and table row metrics unchanged',async()=>{
 const d=fixture();const inactive:any={...fakeRuntime,spacingProbe:{keepTableStart:()=>false}};
 expect(await documentFlow(d,inactive)).toEqual(await documentFlow(d,fakeRuntime));
});
