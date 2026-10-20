import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {cellTableFlow} from '../../src/layout/cellTableFlow.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {groupLabelTemplate,groupLabelRequest} from '../helpers/groupLabels.js';
import {fakeRuntime} from '../helpers/document.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
function doc(groups:any[]=[{name:'G',members:Array.from({length:8},(_,i)=>({name:'R'+i}))}],edit=(t:any)=>{}){
 const t=groupLabelTemplate();edit(t);const v=ok(validateTemplate(t));return ok(composeDocument(v,ok(prepareGeneration(v,groupLabelRequest(t,groups)))));
}
async function run(d:any,height=100,initial=0,next=height,bounded=false,runtime=fakeRuntime){
 const pages:any[][]=[[]],borders:any[][]=[[]];let index=0;
 const sink:any={bounded,top:0,bottom:height,left:0,availableWidth:500,y:initial,get nextCapacity(){return next;},nextPage(){if(++index>40)throw Error('loop guard');pages.push([]);borders.push([]);this.y=0;this.bottom=next;},emitItem(item:any,x:number,y:number){pages[index]!.push({nodeId:item.nodeId,text:item.kind==='text-line'?item.line.run?.text:'IMAGE',height:item.heightPt,x,y});},border(...args:any[]){borders[index]!.push(args);}};
 await cellTableFlow(d,d.nodes[d.rootIds[0]],runtime,sink);return {pages,borders,y:sink.y};
}
const source=(d:any,e:any)=>d.sourceMap[e.nodeId]?.sourceId;
const memberTexts=(d:any,r:any)=>r.pages.flat().filter((e:any)=>source(d,e)==='memberText').map((e:any)=>e.text);
function assertLabels(d:any,r:any,name='G'){
 const groups=d.nodes[d.rootIds[0]].rowGroups;
 for(const g of groups){let seen=false;const labelId=d.nodes[g.groupLabel.cellId].childIds[0];
  for(const page of r.pages){const members=page.filter((e:any)=>source(d,e)==='memberText'&&d.sourceMap[e.nodeId].groupIndex===g.groupIndex);
   const labels=page.filter((e:any)=>e.nodeId===labelId);
   if(members.length){expect(labels.map((e:any)=>e.text).join('')).toBe(name+(seen?' (ต่อ)':''));seen=true;}
   else expect(labels).toEqual([]);
  }
 }
}
it('repeats one group name per member fragment without mutating or duplicating data',async()=>{
 const d=doc(),before=structuredClone(d),r=await run(d);
 expect(r.pages.length).toBeGreaterThan(2);assertLabels(d,r);expect(memberTexts(d,r)).toEqual(Array.from({length:8},(_,i)=>'R'+i));expect(d).toEqual(before);
});
it('continues a single long member and repeats the full group label',async()=>{
 const lines=Array.from({length:16},(_,i)=>'L'+i),d=doc([{name:'G',members:[{name:lines.join('\n')}]}]);
 const r=await run(d);expect(r.pages.length).toBeGreaterThan(3);assertLabels(d,r);expect(memberTexts(d,r)).toEqual(lines);
});
it('resets continuation for equal names in separate groups',async()=>{
 const groups=[0,1].map(g=>({name:'G',members:Array.from({length:5},(_,i)=>({name:`M${g}-${i}`}))})),d=doc(groups),r=await run(d);
 assertLabels(d,r);expect(memberTexts(d,r)).toEqual(groups.flatMap(g=>g.members.map(m=>m.name)));
});
it('moves a group start instead of drawing a label without its first member',async()=>{
 const d=doc([{name:'G',members:[{name:'ONE'}]}]),r=await run(d,100,60);
 expect(r.pages[0].map(e=>e.text)).toEqual(['before']);assertLabels(d,r);expect(memberTexts(d,r)).toEqual(['ONE']);
});
it('keeps a prefix with a taller whole label and the first member fragment',async()=>{
 const d=doc([{name:'A\nB\nC',members:[{name:'ONE'}]}],t=>{t.areaFormats.meeting.rowGroups[0].rowTemplateIds.unshift('before');});
 const r=await run(d,100,40);expect(r.pages[0]).toEqual([]);expect(r.pages[1].map(e=>e.text)).toEqual(['before','A','B','C','ONE']);
});
it('keeps multiline labels whole on every continuation fragment',async()=>{
 const d=doc([{name:'Top\nBottom',members:Array.from({length:9},(_,i)=>({name:'R'+i}))}]),r=await run(d),label=d.nodes[d.nodes[d.rootIds[0]].rowGroups[0].groupLabel.cellId].childIds[0];
 let seen=false;for(const page of r.pages){if(!page.some(e=>source(d,e)==='memberText'))continue;
  expect(page.filter(e=>e.nodeId===label).map(e=>e.text)).toEqual(['Top',seen?'Bottom (ต่อ)':'Bottom']);seen=true;}
 expect(memberTexts(d,r)).toHaveLength(9);
});
it('reserves height when a label is taller than all short members',async()=>{
 const d=doc([{name:'A\nB\nC',members:[{name:'ONE'}]}]),r=await run(d,100);
 const text=r.pages.flat().map(e=>e.text);expect(text).toEqual(['before','A','B','C','ONE','after']);
 for(const [i,page] of r.pages.entries())if(page.some(e=>source(d,e)==='memberText'))expect(page.filter(e=>source(d,e)==='memberLabelText')).toHaveLength(3);
});
it('closes each page table and does not emit duplicate border segments',async()=>{
 const r=await run(doc());
 for(const edges of r.borders.filter(p=>p.length)){
  const bottom=Math.max(...edges.flatMap(e=>[e[1],e[3]]));expect(bottom).toBeLessThanOrEqual(100+1e-6);
  expect(edges.some(e=>e[0]===0&&e[2]===200&&e[1]===bottom&&e[3]===bottom)).toBe(true);
  expect(new Set(edges.map(e=>JSON.stringify(e.slice(0,4)))).size).toBe(edges.length);
 }
});
it('does not paint an empty start of the next member row at the page bottom',async()=>{
 const r=await run(doc());
 expect(Math.max(...r.borders[0].flatMap(e=>[e[1],e[3]]))).toBe(78);
});
it('supports repeated headers and measured next-page capacity',async()=>{
 const d=doc(undefined,t=>{const n=t.areaFormats.meeting.fragment.nodes;n.table.props.headerRowCount=1;n.table.props.repeatHeaderRows=true;}),r=await run(d,70,0,110);
 assertLabels(d,r);expect(memberTexts(d,r)).toHaveLength(8);
 for(const page of r.pages)if(page.some(e=>source(d,e)==='memberText'))expect(page[0].text).toBe('before');
});
it('fails a label that cannot fit a full page without looping',async()=>{
 const d=doc([{name:Array(8).fill('NAME').join('\n'),members:[{name:'ONE'}]}]);
 await expect(run(d,100)).rejects.toMatchObject({reason:'group-label-does-not-fit'});
});
it('reports an oversized empty-group label as a label failure',async()=>{
 const d=doc([{name:Array(8).fill('NAME').join('\n'),members:[]}]);
 await expect(run(d,100)).rejects.toMatchObject({reason:'group-label-does-not-fit'});
});
it('does not shape an unused suffix in a fixed frame or a single-page auto table',async()=>{
 const d=doc([{name:'G',members:[{name:'ONE'}]}]),runtime={...fakeRuntime,async shape(text:string){if(text.includes('ต่อ'))throw Error('suffix not supported by this font');return fakeRuntime.shape(text);}};
 await expect(run(d,100,0,100,true,runtime)).resolves.toBeDefined();
 await expect(run(d,200,0,200,false,runtime)).resolves.toBeDefined();
});
it('can continue rows containing empty strings under a repeated header',async()=>{
 const d=doc([{name:'G',members:Array.from({length:16},()=>({name:''}))}],t=>{const n=t.areaFormats.meeting.fragment.nodes;n.table.props.headerRowCount=1;n.table.props.repeatHeaderRows=true;});
 const r=await run(d,75);expect(r.pages.length).toBeGreaterThan(1);
 const label=d.nodes[d.nodes[d.rootIds[0]].rowGroups[0].groupLabel.cellId].childIds[0];
 expect(r.pages.flat().filter(e=>e.nodeId===label).length).toBeGreaterThan(1);
});
it('remeasures a suffix that increases the wrapped label height',async()=>{
 const name='ABCDEFGHIJKLM',d=doc([{name,members:Array.from({length:9},(_,i)=>({name:'R'+i}))}]),r=await run(d,90);
 assertLabels(d,r,name);expect(memberTexts(d,r)).toHaveLength(9);
 for(const page of r.pages)for(const e of page)expect(e.y+e.height).toBeLessThanOrEqual(90+1e-6);
});
it('uses a fixed frame without moving omitted data to a later page',async()=>{
 const d=doc(undefined,t=>{t.areaFormats.meeting.sizing={mode:'fixed',height:{value:300,unit:'pt'}};const p=t.pageLayouts.normal.page;p.margin.top={value:0,unit:'pt'};p.margin.bottom={value:297*72/25.4-120,unit:'pt'};}),before=structuredClone(d),r=await documentFlow(d,fakeRuntime);
 expect(r.pages).toHaveLength(1);expect(r.warnings?.[0].code).toBe('FORMAT_CONTENT_OMITTED');
 const values=r.pages[0].commands.map(c=>c.text);expect(values).toContain('G');expect(values.some(s=>s.includes('(ต่อ)'))).toBe(false);
 const pending=r.warnings?.[0].formatOmission?.pending??[];expect(pending.some(c=>c.groupId==='companies'&&c.itemIndex!==undefined)).toBe(true);expect(d).toEqual(before);
});
it('fixed omits the whole label if there is not enough room for the full name',async()=>{
 const d=doc([{name:'A\nB\nC',members:[{name:'ONE'}]}],t=>{t.areaFormats.meeting.sizing={mode:'fixed',height:{value:55,unit:'pt'}};}),r=await documentFlow(d,fakeRuntime);
 expect(r.warnings?.[0].code).toBe('FORMAT_CONTENT_OMITTED');expect(r.pages[0].commands.map(c=>c.text)).toEqual(['before']);
});
function addNote(t:any){t.areaFormats.note={key:'note',ownerAreaId:'main-details',inputSchema:{type:'object',fields:{text:{type:'string',required:true}}},repeats:[],fragment:{rootIds:['note'],nodes:{note:{id:'note',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'value',type:'field-ref',scope:'local',key:'text'}]}}}};}
it('fixed reserves its effective frame and the following Format moves independently',async()=>{
 const t=groupLabelTemplate();t.areaFormats.meeting.sizing={mode:'fixed',height:{value:300,unit:'pt'}};addNote(t);
 const p=t.pageLayouts.normal.page;p.margin.top={value:0,unit:'pt'};p.margin.bottom={value:297*72/25.4-120,unit:'pt'};
 const request=groupLabelRequest(t,[{name:'G',members:Array.from({length:9},(_,i)=>({name:'R'+i}))}]);request.sections[0].data.details.push({format:'note',data:{text:'NEXT'}} as any);
 const v=ok(validateTemplate(t)),d=ok(composeDocument(v,ok(prepareGeneration(v,request)))),r=await documentFlow(d,fakeRuntime);
 expect(r.pages).toHaveLength(2);expect(r.pages[1].commands.map(c=>c.text)).toEqual(['NEXT']);expect(r.warnings).toHaveLength(1);
 expect(r.pages[0].commands.every(c=>c.bounds.yPt+c.lineHeightPt<=120)).toBe(true);
});
it('fixed keeps the reservation even when all group content fits',async()=>{
 const t=groupLabelTemplate();t.areaFormats.meeting.sizing={mode:'fixed',height:{value:300,unit:'pt'}};addNote(t);
 const p=t.pageLayouts.normal.page;p.margin.top={value:0,unit:'pt'};p.margin.bottom={value:297*72/25.4-400,unit:'pt'};
 const request=groupLabelRequest(t,[{name:'G',members:[{name:'R'}]}]);request.sections[0].data.details.push({format:'note',data:{text:'NEXT'}} as any);
 const v=ok(validateTemplate(t)),d=ok(composeDocument(v,ok(prepareGeneration(v,request)))),r=await documentFlow(d,fakeRuntime);
 expect(r.warnings).toBeUndefined();expect(r.pages[0].commands.find(c=>c.text==='NEXT')?.bounds.yPt).toBe(300);
});
it('preserves protected members and reports impossible images under the existing rules',async()=>{
 const d=doc([{name:'G',members:[{name:'A\nB'},{name:'C\nD'}]}],t=>{t.areaFormats.meeting.fragment.nodes.member.props.allowBreak=false;}),r=await run(d,100);
 assertLabels(d,r);expect(r.pages.filter(p=>p.some(e=>e.text==='A'))[0].map(e=>e.text)).toContain('B');
 const imageDoc=doc([{name:'G',members:[{name:'A'}]}],t=>{const f=t.areaFormats.meeting;f.inputSchema.fields.companies.items.fields.members.items.fields.photo={type:'image'};f.fragment.nodes.memberCell.childIds.unshift('image');f.fragment.nodes.image={id:'image',type:'image',props:{width:{value:20,unit:'pt'},height:{value:200,unit:'pt'},source:{scope:'item',key:'photo'}}};});
 await expect(run(imageDoc,100)).rejects.toThrow(/Image frame/);
});
it.each([70,72,75])('fits a tall label beside several protected rows in a %ipt page',async height=>{
 const d=doc([{name:'A\nB\nC',members:Array.from({length:6},(_,i)=>({name:'R'+i}))}],t=>{t.areaFormats.meeting.fragment.nodes.member.props.allowBreak=false;}),r=await run(d,height);
 expect(memberTexts(d,r)).toEqual(Array.from({length:6},(_,i)=>'R'+i));
 for(const page of r.pages)if(page.some(e=>source(d,e)==='memberText')){expect(page.filter(e=>source(d,e)==='memberLabelText').length).toBeGreaterThanOrEqual(3);for(const e of page)expect(e.y+e.height).toBeLessThanOrEqual(height+1e-6);}
});
it('fixed renders complete protected members beside a taller label before warning',async()=>{
 const d=doc([{name:'A\nB\nC',members:Array.from({length:4},(_,i)=>({name:'R'+i}))}],t=>{t.areaFormats.meeting.fragment.nodes.member.props.allowBreak=false;});
 const pages:any[]=[];let y=0;
 const sink:any={bounded:true,top:0,bottom:96,left:0,availableWidth:500,get y(){return y;},set y(v:number){y=v;},nextPage(){throw Error('fixed must not paginate');},emitItem(item:any){pages.push(item.line?.run?.text);},border(){}};
 let error:any;try{await cellTableFlow(d,d.nodes[d.rootIds[0]],fakeRuntime,sink);}catch(e){error=e;}
 expect(pages).toContain('R0');expect(pages).toContain('R1');expect(pages).not.toContain('R2');
 expect(error?.pending.some((c:any)=>c.groupId==='companies'&&c.itemIndex===2)).toBe(true);
});
it('keeps links and TOC destinations unique while repeating only group label text',async()=>{
 const groups=[{name:'G',members:Array.from({length:8},(_,i)=>({name:'R'+i,anchor:'a'+i}))}],d=doc(groups,t=>{
  const f=t.areaFormats.meeting,n=f.fragment.nodes;f.inputSchema.fields.companies.items.fields.members.items.fields.anchor={type:'string',required:true};
  n.memberText.props.anchorId={scope:'item',key:'anchor'};n.memberText.props.toc={level:1};
  n.memberCell.childIds.push('memberLink');n.memberLink={id:'memberLink',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'go',type:'link',text:'go',url:'https://example.com'}]};
  n.afterText.children.push({id:'jump',type:'reference',text:'jump',target:'a7'});
  n.toc={id:'toc',type:'table-of-contents',props:{textStyleId:'body',scope:{kind:'section'}}};f.fragment.rootIds.unshift('toc');
  const p=t.pageLayouts.normal.page;p.margin.top={value:0,unit:'pt'};p.margin.bottom={value:297*72/25.4-140,unit:'pt'};
 });
 const before=structuredClone(d),r=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,r);
 expect(Object.keys(anchors)).toHaveLength(8);expect(r.contentsSlots).toHaveLength(8);
 await fillContentsNumbers(r,anchors,fakeRuntime,true);resolveLinkGeometry(d,r,anchors);
 expect(r.pages.flatMap(p=>p.annotations??[]).filter(a=>a.destination.type==='external')).toHaveLength(8);expect(d).toEqual(before);
});
