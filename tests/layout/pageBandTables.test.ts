import {it,expect} from 'vitest';
import {assemblyTemplate} from '../helpers/assembly.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {validateTemplate,prepareGeneration,composeDocument,createDocxEngine} from '../../src/index.js';
import {fonts,noImages,staged} from '../docx/helpers.js';
import JSZip from 'jszip';

function fixture(){
 const t=assemblyTemplate();t.sections=t.sections.slice(0,1);
 const s=t.sections[0];
 const pt=(value:number)=>({value,unit:'pt'});
 s.source.fragment.nodes.text.children=[{id:'body-run',type:'text',text:Array(60).fill('BODY').join('\n')}];
 for(const kind of ['header','footer']){
  s[kind]={baseTextStyleId:'body',inputSchema:{type:'object',fields:{}},fragment:{rootIds:['table'],nodes:{
   table:{id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:pt(240)},{width:pt(70)}],rowIds:['first','last']},
   first:{id:'first',type:'table-row',props:{allowBreak:false},cellIds:['merged','right']},
   last:{id:'last',type:'table-row',props:{allowBreak:false},cellIds:['other']},
   merged:{id:'merged',type:'table-cell',props:{columnIndex:0,rowSpan:2,fillColor:'E3F2FD'},childIds:['label']},
   right:{id:'right',type:'table-cell',props:{columnIndex:1},childIds:[]},
   other:{id:'other',type:'table-cell',props:{columnIndex:1},childIds:[]},
   label:{id:'label',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'prefix',type:'text',text:kind+' '},{id:'name',type:'field-ref',scope:'section',key:'name'}]}
  }}};
 }
 return t;
}

function take<T>(result:{ok:true;value:T}|{ok:false;issues:unknown}):T{
 if(!result.ok)throw Error(JSON.stringify(result.issues));return result.value;
}
it('repeats merged header and footer tables with each Section use and reserves their body space',async()=>{
 const template=fixture(),v=take(validateTemplate(template));
 const sections=['Alpha','Beta'].map((name,i)=>({sectionKey:'A',instanceKey:'bill-'+i,data:{name}}));
 const d=take(composeDocument(v,take(prepareGeneration(v,{docKey:template.docKey,sections}))));
 const {pages}=await documentFlow(d,fakeRuntime);
 expect(pages.length).toBeGreaterThan(2);
 for(const p of pages){
  const name=p.sectionId==='instance-bill-0'?'Alpha':'Beta';
  const header=p.commands.find(c=>c.text==='header '+name)!;
  const footer=p.commands.find(c=>c.text==='footer '+name)!;
  expect(header.bounds.yPt).toBeLessThan(footer.bounds.yPt);
  expect(p.commands.filter(c=>c.text==='BODY').every(c=>c.bounds.yPt>header.bounds.yPt&&c.bounds.yPt+c.bounds.heightPt<footer.bounds.yPt)).toBe(true);
  expect(p.fills?.length).toBe(2);
 }
});
it('still rejects Area and page-break anywhere inside a page band',()=>{
 for(const type of ['area','page-break']){
  const t=fixture(),f=t.sections[0].header.fragment;
  f.rootIds.push('extra');f.nodes.extra={id:'extra',type,props:{areaId:'x'}};
  expect(validateTemplate(t).ok).toBe(false);
 }
});

it('emits editable native tables including merged cells in both DOCX page bands',async()=>{
 const t=fixture();
 t.sections[0].bodySideBorders=true;
 for(const kind of ['header','footer'])t.sections[0][kind].fragment.nodes.label.children.shift();
 const v=take(validateTemplate(t));
 const d=take(composeDocument(v,take(prepareGeneration(v,{docKey:t.docKey,sections:[{sectionKey:'A',instanceKey:'bill-0',data:{name:'A'}}]}))));
 const e=take(await createDocxEngine(fonts())),sink=staged();
 take(await e.generateDocxTo(d,noImages,sink.output,{textLayout:'native'}));
 const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));
 const document=await zip.file('word/document.xml')!.async('string');
 expect(document).toMatch(/<w:pgBorders[^>]*w:offsetFrom="text"[^>]*>.*<w:left [^>]*w:val="single"/);
 for(const band of ['header','footer']){
  const files=Object.keys(zip.files).filter(name=>name.startsWith('word/'+band)&&name.endsWith('.xml'));
  expect(files).toHaveLength(2);
  for(const file of files){
   const xml=await zip.file(file)!.async('string');
   expect(xml).toContain('<w:tbl>');
   expect(xml).toContain('<w:vMerge w:val="restart"');
   expect(xml).toContain('>A</w:t>');
  }
 }
});
it('rejects bands that consume the available body instead of clipping or repeating empty pages',async()=>{
 const t=fixture(),s=t.sections[0],v1={unit:'pt',value:390};
 s.header.sizing={mode:'fixed',height:v1};s.footer.sizing={mode:'fixed',height:v1};
 const v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,{docKey:t.docKey,sections:[{sectionKey:'A',instanceKey:'bill-0',data:{name:'Alpha'}}]}))));
 await expect(documentFlow(d,fakeRuntime)).rejects.toThrow('Page bands leave no body space');
});
it('draws opt-in body sides through the reserved space between the bands on every page',async()=>{
 const t=fixture();
 t.sections[0].bodySideBorders=true;
 const v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,{docKey:t.docKey,sections:[{sectionKey:'A',instanceKey:'bill-0',data:{name:'Alpha'}}]}))));
 const draw=await documentFlow(d,fakeRuntime);
 expect(draw.pages.length).toBeGreaterThan(1);
 for(const page of draw.pages){
  const sides=page.borders!.filter(b=>b.nodeId===page.sectionId);
  expect(sides).toHaveLength(2);
  expect(sides.every(b=>b.x1Pt===b.x2Pt&&b.y1Pt<b.y2Pt)).toBe(true);
  expect(sides[0]!.y1Pt).toBeLessThan(sides[0]!.y2Pt-300);
 }
});
it.each([['portrait',612,792],['landscape',792,612]])('uses Letter dimensions in layout and native DOCX for %s',async(orientation,width,height)=>{
 const t=fixture(),s=t.sections[0],page=t.pageLayouts[s.pageLayoutId??t.book.defaultPageLayoutId].page;
 page.size='Letter';page.orientation=orientation;
 for(const band of ['header','footer'])s[band].fragment.nodes.label.children.shift();
 const v=take(validateTemplate(t)),d=take(composeDocument(v,take(prepareGeneration(v,{docKey:t.docKey,sections:[{sectionKey:'A',instanceKey:'bill-0',data:{name:'A'}}]}))));
 const draw=await documentFlow(d,fakeRuntime);
 expect(draw.pages.every(p=>p.widthPt===width&&p.heightPt===height)).toBe(true);
 const e=take(await createDocxEngine(fonts())),sink=staged();
 take(await e.generateDocxTo(d,noImages,sink.output,{textLayout:'native'}));
 const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await zip.file('word/document.xml')!.async('string');
 expect(xml).toContain(`<w:pgSz w:w="${width*20}" w:h="${height*20}" w:orient="${orientation}"/>`);
});

it('outlines band-cell text and places selected footer roots on each Section first page',async()=>{
 const t=fixture(),s=t.sections[0];
 s.header.fragment.nodes.label.props.outline=true;
 s.header.fragment.nodes.label.children[0].text='H ';
 const footer=s.footer;
 footer.fragment.nodes.label.children[0].text='F ';
 footer.fragment.rootIds.unshift('say');
 footer.fragment.nodes.say={id:'say',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'say-prefix',type:'text',text:'SAY '},{id:'say-name',type:'field-ref',scope:'section',key:'name'}]};
 footer.firstPageOnly=['missing'];
 expect(validateTemplate(t).ok).toBe(false);
 footer.firstPageOnly=['say'];
 const v=take(validateTemplate(t));
 const sections=['A','B'].map((name,i)=>({sectionKey:'A',instanceKey:'bill-'+i,data:{name}}));
 const d=take(composeDocument(v,take(prepareGeneration(v,{docKey:t.docKey,sections}))));
 const {pages}=await documentFlow(d,fakeRuntime);
 for(const [i,name] of ['A','B'].entries()){
  const bill=pages.filter(p=>p.sectionId==='instance-bill-'+i);
  expect(bill.length).toBeGreaterThan(1);
  expect(bill[0]!.commands.find(c=>c.text==='SAY '+name)!.bounds.yPt).toBeLessThan(bill[0]!.commands.find(c=>c.text==='F '+name)!.bounds.yPt);
  expect(bill.slice(1).every(p=>!p.commands.some(c=>c.text.startsWith('SAY ')))).toBe(true);
  expect(bill.every(p=>p.borders!.filter(b=>b.nodeId.endsWith('band-header~label')).length===4)).toBe(true);
 }
 const engine=take(await createDocxEngine(fonts())),sink=staged();
 take(await engine.generateDocxTo(d,noImages,sink.output,{textLayout:'native'}));
 const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));
 const readBands=async (kind:string)=>Promise.all(Object.keys(zip.files).filter(file=>file.startsWith('word/'+kind)&&file.endsWith('.xml')).map(file=>zip.file(file)!.async('string')));
 const headers=await readBands('header'),footers=await readBands('footer');
 expect(headers).toHaveLength(4);
 expect(headers.every(xml=>xml.includes('<w:pBdr>'))).toBe(true);
 expect(footers).toHaveLength(4);
 expect(footers.filter(xml=>xml.includes('>SAY </w:t>'))).toHaveLength(2);
});
