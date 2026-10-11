import {it,expect} from 'vitest';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {rowGroupTemplate,rowGroupRequest} from '../helpers/rowGroups.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
import {readFileSync} from 'node:fs';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
function compose(t=rowGroupTemplate(),r=rowGroupRequest()){const v=ok(validateTemplate(t));return ok(composeDocument(v,ok(prepareGeneration(v,r))));}
const rows=(d:any)=>{const t=d.nodes[d.rootIds[0]];return t.rowIds.map((id:string)=>d.nodes[d.nodes[d.nodes[id].cellIds[0]].childIds[0]].children.map((c:any)=>c.text??'').join(''));};
it('expands two arrays in order, keeping static rows and independent source identities',()=>{
 const d=compose();expect(rows(d)).toEqual(['before','Same','labels','A','B','Same','labels','C','after']);
 expect(validateResolvedDocument(JSON.parse(JSON.stringify(d)))).toEqual([]);
 const sources=Object.values(d.sourceMap) as any[];expect(sources.filter(s=>s.sourceId==='member').map(s=>[s.groupId,s.groupIndex,s.itemIndex])).toEqual([['companies',0,0],['companies',0,1],['companies',1,0]]);
 expect(d.nodes[d.rootIds[0]].rowGroups).toHaveLength(2);
});
it('removes outer empty groups and chooses the authored empty row for inner empty arrays',()=>{
 expect(rows(compose(undefined,rowGroupRequest([])))).toEqual(['before','after']);
 expect(rows(compose(undefined,rowGroupRequest([{name:'Empty',members:[]}])))).toEqual(['before','Empty','labels','empty','after']);
});
it('validates nested values with indexed paths and refuses forged prepared extras',()=>{
 const v=ok(validateTemplate(rowGroupTemplate()));
 for(const members of [null,'wrong',[{name:4}],undefined]){const r=rowGroupRequest([{name:'X',...(members===undefined?{}:{members})}]);const p=prepareGeneration(v,r);expect(p.ok).toBe(false);if(!p.ok)expect(p.issues.some(i=>i.path.includes('companies[0].members'))).toBe(true);}
 const p=ok(prepareGeneration(v,rowGroupRequest()));p.sections.main.content[0].data.companies[0].members[0].extra='bad';expect(composeDocument(v,p).ok).toBe(false);
});
it('clones nested defaults and distinguishes absent optional arrays from explicit empty arrays',()=>{
 const t=rowGroupTemplate(),a=t.sections[0].formats.meeting.inputSchema.fields.companies;a.required=false;a.default=[{name:'Default',members:[{name:'Member'}]}];a.items.fields.members.required=false;
 const v=ok(validateTemplate(t)),r=rowGroupRequest();delete (r.sections.main.content[0]!.data as any).companies;
 const p=ok(prepareGeneration(v,r));p.sections.main.content[0].data.companies[0].members[0].name='changed';expect(rows(ok(composeDocument(v,ok(prepareGeneration(v,r)))))).toContain('Member');
 expect(rows(compose(t,rowGroupRequest([])))).toEqual(['before','after']);
 expect(rows(compose(t,rowGroupRequest([{name:'X'}])))).toContain('empty');
});
it('rejects third array depth, misplaced item/group refs, dotted sources and overlapping declarations',()=>{
 const edits=[(f:any)=>{f.inputSchema.fields.companies.items.fields.members.items.fields.deep={type:'array',items:{type:'object',fields:{name:{type:'string'}}}};},(f:any)=>{f.fragment.nodes.companyText.children[0].scope='item';},(f:any)=>{f.fragment.nodes.beforeText.children=[{id:'bad',type:'field-ref',scope:'group',key:'name'}];},(f:any)=>{f.rowGroups[0].source.key='companies.members';},(f:any)=>{f.rowGroups.push({...structuredClone(f.rowGroups[0]),id:'overlap'});}];
 for(const edit of edits){const t=rowGroupTemplate();edit(t.sections[0].formats.meeting);expect(validateTemplate(t).ok).toBe(false);}
});
it('gates nested arrays and declarations away from older model versions',()=>{
 for(const version of [15,16]){const t=rowGroupTemplate();t.nodeModelVersion=version;expect(validateTemplate(t).ok).toBe(false);delete t.sections[0].formats.meeting.rowGroups;expect(validateTemplate(t).ok).toBe(false);}
});
it('retains keepStart and passes it to pagination',async()=>{
 const t=rowGroupTemplate();t.sections[0].formats.meeting.rowGroups[0].pagination.keepStart=true;
 const d=compose(t);expect(d.nodes[d.rootIds[0]].rowGroups[0].keepStart).toBe(true);
 expect((await documentFlow(d,fakeRuntime)).pages).toHaveLength(1);
 expect((await documentFlow(compose(),fakeRuntime)).pages).toHaveLength(1);
});
it('rejects malformed declarations, spans, repetition overlap and empty item schemas',()=>{
 const edits=[
  (f:any)=>f.rowGroups=null,
  (f:any)=>f.rowGroups[0].id='bad~id',
  (f:any)=>f.rowGroups[0].pagination={keepStart:'true'},
  (f:any)=>f.rowGroups[0].rowTemplateIds=['company','member','labels','empty'],
  (f:any)=>f.rowGroups[0].rowTemplateIds=['company','member','empty'],
  (f:any)=>f.rowGroups[0].source.scope='item',
  (f:any)=>f.rowGroups[0].memberRepeat.source.scope='local',
  (f:any)=>f.rowGroups[0].memberRepeat.source.key='name',
  (f:any)=>f.rowGroups[0].memberRepeat.emptyRowTemplateId='labels',
  (f:any)=>f.fragment.nodes.table.props.headerRowCount=2,
  (f:any)=>{f.fragment.nodes.companyCell.props.rowSpan=2;},
  (f:any)=>{f.fragment.nodes.beforeCell.props.rowSpan=2;},
  (f:any)=>f.repeats.push({tableId:'table',rowTemplateId:'member',source:{scope:'local',key:'companies'}}),
  (f:any)=>f.cellRepeats=[{id:'other',cellId:'memberCell',childTemplateIds:['memberText'],source:{scope:'local',key:'companies'}}],
  (f:any)=>{f.inputSchema.fields.companies.items.fields.members.items.fields={};},
  (f:any)=>{f.inputSchema.fields.companies.items.fields.extra={type:'object',fields:{}};},
  (f:any)=>{f.inputSchema.fields.companies.items.fields.extra={type:'area',areaId:'bad'};},
  (f:any)=>{f.fragment.nodes.emptyText.children=[{id:'bad',type:'field-ref',scope:'item',key:'name'}];},
  (f:any)=>{f.fragment.nodes.memberText.children[0].key='members';f.fragment.nodes.memberText.children[0].scope='group';}
 ];
 for(const [i,edit] of edits.entries()){const t=rowGroupTemplate();edit(t.sections[0].formats.meeting);expect(validateTemplate(t).ok,'edit '+i).toBe(false);}
});
it('supports two disjoint groups in a table and repeated instances across sections',()=>{
 const t=rowGroupTemplate(),f=t.sections[0].formats.meeting,n=f.fragment.nodes;
 for(const rid of f.rowGroups[0].rowTemplateIds){for(const id of [rid,rid+'Cell',rid+'Text']){const v=structuredClone(n[id]);v.id='second'+id;if(v.cellIds)v.cellIds=v.cellIds.map((x:string)=>'second'+x);if(v.childIds)v.childIds=v.childIds.map((x:string)=>'second'+x);if(v.children)v.children.forEach((c:any)=>c.id='second'+c.id);n[v.id]=v;}}
 n.table.rowIds.push(...f.rowGroups[0].rowTemplateIds.map((x:string)=>'second'+x));
 const second=structuredClone(f.rowGroups[0]);second.id='second';second.rowTemplateIds=second.rowTemplateIds.map((x:string)=>'second'+x);second.memberRepeat.rowTemplateId='secondmember';second.memberRepeat.emptyRowTemplateId='secondempty';f.rowGroups.push(second);
 const r=rowGroupRequest();r.sections.main.content.push(structuredClone(r.sections.main.content[0]!));
 const s=structuredClone(t.sections[0]);s.id='other';s.key='other';t.sections.push(s);(r.sections as any).other=structuredClone(r.sections.main);
 const d=compose(t,r);expect(d.rootIds).toHaveLength(4);expect(new Set(Object.keys(d.nodes)).size).toBe(4*(1+16*3));expect(validateResolvedDocument(d)).toEqual([]);
 for(const id of d.rootIds)expect(d.nodes[id].rowGroups.map((g:any)=>g.groupId)).toEqual(['companies','companies','second','second']);
});
it('binds inner images and links and outer group values without falling through scopes',()=>{
 const t=rowGroupTemplate(),f=t.sections[0].formats.meeting,n=f.fragment.nodes,fields=f.inputSchema.fields.companies.items.fields.members.items.fields;
 fields.photo={type:'image',required:true};fields.link={type:'link',required:true};
 n.memberCell.childIds.push('photo');n.photo={id:'photo',type:'image',props:{width:{value:20,unit:'pt'},height:{value:20,unit:'pt'},source:{scope:'item',key:'photo'}}};n.memberText.children.push({id:'link',type:'field-ref',scope:'item',key:'link'},{id:'companyName',type:'field-ref',scope:'group',key:'name'});
 const image='22222222-2222-4222-8222-222222222222',link={type:'link',text:'Site',url:'https://example.com'};
 const d=compose(t,rowGroupRequest([{name:'Company',members:[{name:'Person',photo:image,link}]}]));
 expect(Object.values(d.nodes).filter((n:any)=>n.type==='image').map((n:any)=>n.props.resourceId)).toEqual([image]);
 const text:any=Object.values(d.nodes).find((n:any)=>n.type==='text-block'&&n.id.includes('memberText'));expect(text.children.map((c:any)=>c.text)).toEqual(['Person','Site','Company']);
});
it('supports authored section/global sources and Area formats',()=>{
 for(const scope of ['section','global']){const t=rowGroupTemplate(),s=t.sections[0],f=s.formats.meeting,r=rowGroupRequest();
  (scope==='global'?t.globalSchema:s.inputSchema).fields.companies=f.inputSchema.fields.companies;f.rowGroups[0].source.scope=scope;s.source={kind:'authored',fragment:f.fragment,repeats:[],rowGroups:f.rowGroups};s.formats={};
  const data=r.sections.main.content[0]!.data;if(scope==='global')r.data=data;else (r.sections.main as any).data=data;r.sections.main.content=[];
  expect(rows(compose(t,r))).toContain('C');
 }
 const t=rowGroupTemplate(),s=t.sections[0],f=s.formats.meeting;
 t.areaFormats={meeting:{...f,key:'meeting',ownerAreaId:'area'}};s.formats={};s.inputSchema.fields.details={type:'area',areaId:'area'};
 s.source={kind:'authored',repeats:[],fragment:{rootIds:['area'],nodes:{area:{id:'area',type:'area',props:{areaId:'area'}}}}};
 const r:any={docKey:t.docKey,data:{},sections:{main:{data:{details:[{format:'meeting',data:rowGroupRequest().sections.main.content[0]!.data}]}}}};
 expect(rows(compose(t,r))).toContain('C');
});
it('rejects forged group boundaries and identities after a JSON round-trip',()=>{
 for(const edit of [(d:any)=>d.nodes[d.rootIds[0]].rowGroups[0].rowIds.pop(),(d:any)=>d.nodes[d.rootIds[0]].rowGroups[0].groupIndex=2,(d:any)=>{const id=d.nodes[d.rootIds[0]].rowGroups[0].firstMemberRowId;d.sourceMap[id].groupIndex=9;},(d:any)=>delete d.nodes[d.rootIds[0]].rowGroups]){const d=compose();edit(d);expect(validateResolvedDocument(d).length).toBeGreaterThan(0);}
});
it('rejects a forged resolved span entering a group from a static row',()=>{
 const d=compose(),t=d.nodes[d.rootIds[0]],before=d.nodes[t.rowIds[0]],company=d.nodes[t.rowIds[1]],cell=d.nodes[company.cellIds[0]],text=d.nodes[cell.childIds[0]];
 d.nodes[before.cellIds[0]].props={columnIndex:0,rowSpan:2};company.cellIds=[];
 for(const id of [cell.id,text.id,...text.children.map((c:any)=>c.id)]){delete d.nodes[id];delete d.sourceMap[id];}
 for(const n of Object.values(d.nodes) as any[])if(n.type==='table-cell')n.props.columnIndex=0;
 expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
it('bounds total expansion across instances without returning a partial document',()=>{
 const t=rowGroupTemplate(),v=ok(validateTemplate(t)),r=rowGroupRequest([{name:'Big',members:Array.from({length:13000},()=>({name:'Member'}))}]);r.sections.main.content.push(structuredClone(r.sections.main.content[0]!));
 const result=composeDocument(v,ok(prepareGeneration(v,r)));expect(result.ok).toBe(false);if(!result.ok)expect(result.issues[0]!.code).toBe('EXPANSION_LIMIT');expect(result).not.toHaveProperty('value');
});
it('counts header and footer identities in the same budget as the body',()=>{
 const t=rowGroupTemplate(),s=t.sections[0];
 const band=()=>({baseTextStyleId:'body',inputSchema:{type:'object',fields:{}},fragment:{rootIds:['columns'],nodes:{columns:{id:'columns',type:'columns',props:{},columns:[{weight:1,childIds:['text']}]},text:{id:'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:Array.from({length:50000},(_,i)=>({id:'leaf'+i,type:'text',text:'a'}))}}}});
 s.header=band();s.footer=band();const v=ok(validateTemplate(t)),p=ok(prepareGeneration(v,rowGroupRequest()));
 const result=composeDocument(v,p);expect(result.ok).toBe(false);if(!result.ok)expect(result.issues[0]!.code).toBe('EXPANSION_LIMIT');
});
it('retains legacy numbering, bands, layout and wrap when upgrading a template to model 17',async()=>{
 const t=JSON.parse(readFileSync('fixtures/page-numbering/template.json','utf8')),r=JSON.parse(readFileSync('fixtures/page-numbering/request.json','utf8'));
 const legacy=await documentFlow(compose(t,r),fakeRuntime);t.nodeModelVersion=17;
 expect(await documentFlow(compose(t,r),fakeRuntime)).toEqual(legacy);
});
it('supports valid colSpan and rejects otherwise-valid rowSpan crossing a group boundary',()=>{
 const t=rowGroupTemplate(),n=t.sections[0].formats.meeting.fragment.nodes;
 n.table.columns=[{width:{value:100,unit:'pt'}},{width:{value:100,unit:'pt'}}];
 for(const rid of n.table.rowIds)n[rid+'Cell'].props={columnIndex:0,colSpan:2};
 expect(rows(compose(t))).toContain('C');
 // The grid remains covered by the preceding cell; only group ownership forbids it.
 n.beforeCell.props.rowSpan=2;n.company.cellIds=[];delete n.companyCell;delete n.companyText;
 expect(validateTemplate(t).ok).toBe(false);
});
it('keeps required-before-default and unknown-key warning rules at the second level',()=>{
 const t=rowGroupTemplate(),inner=t.sections[0].formats.meeting.inputSchema.fields.companies.items.fields.members;inner.default=[{name:'Default'}];
 const v=ok(validateTemplate(t));expect(prepareGeneration(v,rowGroupRequest([{name:'X'}])).ok).toBe(false);
 const r=rowGroupRequest([{name:'X',members:[{name:'Person',unused:'ignore'}]}]);const p=ok(prepareGeneration(v,r));
 expect(p.warnings[0].path).toBe('sections.main.content[0].data.companies[0].members[0].unused');
 expect(rows(ok(composeDocument(v,p)))).toContain('Person');
});
