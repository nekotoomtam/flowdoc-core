import {it,expect} from 'vitest';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {resolveTableGrid} from '../../src/composition/tableGrid.js';
import {groupLabelTemplate,groupLabelRequest} from '../helpers/groupLabels.js';
import {rowGroupTemplate,rowGroupRequest} from '../helpers/rowGroups.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
function compose(t=groupLabelTemplate(),groups?:any[]){const v=ok(validateTemplate(t));return ok(composeDocument(v,ok(prepareGeneration(v,groupLabelRequest(t,groups)))));}
const table=(d:any)=>d.nodes[d.rootIds[0]];

it.each([0,1,2,5])('derives one group label for %i members and keeps a valid explicit grid',count=>{
 const d=compose(undefined,[{name:'Group',members:Array.from({length:count},(_,i)=>({name:'M'+i}))}]),t=table(d),g=t.rowGroups[0];
 expect(g.groupLabel.memberCount).toBe(count);expect(g.prefixRowIds).toEqual([]);expect(g.keepStart).toBe(true);
 const label=d.nodes[g.groupLabel.cellId];expect(label.props.rowSpan).toBe(Math.max(1,count));
 expect(g.rowIds).toHaveLength(Math.max(1,count));
 expect(d.sourceMap[label.id]).toMatchObject({groupId:'companies',groupIndex:0,sourceId:count?'memberLabelCell':'emptyLabelCell'});
 for(const id of [label.id,...label.childIds,...d.nodes[label.childIds[0]].children.map((v:any)=>v.id)])expect(d.sourceMap[id]).not.toHaveProperty('itemIndex');
 const grid=resolveTableGrid(t,d.nodes);expect(grid.cells.filter(c=>c.column===0&&g.rowIds.includes(grid.rowIds[c.row]!))).toHaveLength(1);
 const memberRows=g.rowIds.map((id:string)=>d.sourceMap[id].itemIndex);expect(memberRows).toEqual(count?Array.from({length:count},(_,i)=>i):[undefined]);
 expect(validateResolvedDocument(JSON.parse(JSON.stringify(d)))).toEqual([]);
});
it('removes outer-empty groups and retains static rows without label orphans',()=>{
 const d=compose(undefined,[]);expect(table(d).rowGroups).toBeUndefined();expect(table(d).rowIds).toHaveLength(2);
 expect(Object.values(d.sourceMap).some((s:any)=>s.groupId!==undefined)).toBe(false);expect(validateResolvedDocument(d)).toEqual([]);
});
it('keeps equal names in separate groups, independent member indices and empty fallback',()=>{
 const d=compose(),groups=table(d).rowGroups;
 expect(groups.map((g:any)=>[g.groupIndex,g.empty,g.groupLabel.memberCount])).toEqual([[0,false,2],[1,true,0]]);
 expect(groups[0].groupLabel.cellId).not.toBe(groups[1].groupLabel.cellId);
 expect(Object.values(d.nodes).filter((n:any)=>n.type==='text-block').flatMap((n:any)=>n.children.map((c:any)=>c.text)).filter(v=>v==='Same')).toHaveLength(2);
 expect(Object.values(d.nodes).filter((n:any)=>n.type==='text-block').flatMap((n:any)=>n.children.map((c:any)=>c.text)).filter(v=>v==='empty')).toHaveLength(1);
});
it.each(['Module\nA','Module\r\nA','Module\rA','\n Module A \n'].flatMap(name=>[0,2].map(count=>({name,count}))))('preserves multiline labels with $count members: $name',({name,count})=>{
 const d=compose(undefined,[{name,members:Array.from({length:count},(_,i)=>({name:'M'+i}))}]);
 const label=d.nodes[table(d).rowGroups[0].groupLabel.cellId],text=d.nodes[label.childIds[0]];
 expect(text.children.map((c:any)=>c.type==='line-break'?'\n':c.text).join('')).toBe(name.replace(/\r\n?/g,'\n'));
 for(const c of text.children)expect(d.sourceMap[c.id]).not.toHaveProperty('itemIndex');
 expect(validateResolvedDocument(JSON.parse(JSON.stringify(d)))).toEqual([]);
});
it('defaults keepStart to true and accepts prefix rows without spanning them',()=>{
 const t=groupLabelTemplate(),f=t.areaFormats.meeting,n=f.fragment.nodes;
 delete f.rowGroups[0].pagination;
 f.rowGroups[0].rowTemplateIds.unshift('before');
 const d=compose(t,[{name:'X',members:[{name:'A'},{name:'B'}]}]),g=table(d).rowGroups[0];
 expect(g.keepStart).toBe(true);expect(g.prefixRowIds).toHaveLength(1);expect(d.nodes[g.groupLabel.cellId].props.rowSpan).toBe(2);
 expect(d.nodes[g.firstMemberRowId].cellIds).toContain(g.groupLabel.cellId);expect(n.before.cellIds).toEqual(['beforeCell']);
});
it.each(['section','global'])('supports labels in an authored Section using %s data',scope=>{
 const t=groupLabelTemplate(),s=t.sections[0],f=t.areaFormats.meeting;
 (scope==='global'?t.globalSchema:s.inputSchema).fields.companies=f.inputSchema.fields.companies;
 delete s.inputSchema.fields.details;delete t.areaFormats;
 f.rowGroups[0].source.scope=scope;s.source={kind:'authored',fragment:f.fragment,repeats:[],rowGroups:f.rowGroups};
 const r=groupLabelRequest(t),data=r.sections[0].data.details[0].data;
 r.sections[0].data=scope==='global'?{}:data;if(scope==='global')r.data=data;
 const v=ok(validateTemplate(t)),d=ok(composeDocument(v,ok(prepareGeneration(v,r))));
 expect(table(d).rowGroups[0].groupLabel.memberCount).toBe(2);expect(validateResolvedDocument(d)).toEqual([]);
});
it('supports font schema2 without changing label style selection',()=>{
 const t=groupLabelTemplate();t.schemaVersion=2;
 t.styles.body={font:{kind:'library',releaseId:'10000000-0000-4000-8000-000000000099',weight:400,style:'normal'},fontSize:{value:12,unit:'pt'},lineHeightPt:16};
 const d=compose(t);expect(d.styles.body).toEqual(t.styles.body);expect(validateResolvedDocument(d)).toEqual([]);
});
it('supports a label in another column with colSpan and preserves authored styles',()=>{
 const t=groupLabelTemplate(),n=t.areaFormats.meeting.fragment.nodes;
 n.table.columns=[{width:{value:80,unit:'pt'}},{width:{value:60,unit:'pt'}},{width:{value:60,unit:'pt'}}];
 for(const rid of ['before','after'])n[rid+'Cell'].props.colSpan=3;
 for(const rid of ['member','empty']){n[rid+'Cell'].props.columnIndex=0;n[rid+'LabelCell'].props={columnIndex:1,colSpan:2,fillColor:'eeeeee',padding:{left:{value:3,unit:'pt'}}};n[rid+'LabelText'].props.textAlign='center';}
 const d=compose(t,[{name:'X',members:[{name:'A'},{name:'B'}]}]),g=table(d).rowGroups[0],label=d.nodes[g.groupLabel.cellId];
 expect(label.props).toMatchObject({columnIndex:1,colSpan:2,rowSpan:2,fillColor:'eeeeee'});expect(d.nodes[label.childIds[0]].props.textAlign).toBe('center');
});
it('isolates two copied Sections and repeated Format instances with the same local IDs',()=>{
 const t=groupLabelTemplate(),s=structuredClone(t.sections[0]);s.id='10000000-0000-4000-8000-000000000012';s.label='Results 2';s.inputSchema.fields.details.areaId='second-details';s.source.fragment.nodes.area.props.areaId='second-details';t.sections.push(s);
 t.areaFormats.secondMeeting={...structuredClone(t.areaFormats.meeting),ownerAreaId:'second-details'};
 const r=groupLabelRequest(t),copy=structuredClone(r.sections[0]);copy.id=s.id;copy.data.details[0].data.companies[0].members=[{name:'Other'}];r.sections.push(copy);
 r.sections[0].data.details.push(structuredClone(r.sections[0].data.details[0]));
 const v=ok(validateTemplate(t)),d=ok(composeDocument(v,ok(prepareGeneration(v,r))));
 expect(d.rootIds).toHaveLength(3);expect(new Set(d.rootIds).size).toBe(3);
 const labels=d.rootIds.flatMap((id:string)=>d.nodes[id].rowGroups.map((g:any)=>g.groupLabel.cellId));expect(new Set(labels).size).toBe(6);
 expect(d.nodes[d.rootIds[2]].rowGroups[0].groupLabel.memberCount).toBe(1);
 expect(d.nodes[d.rootIds[0]].rowGroups[0].groupLabel.memberCount).toBe(2);expect(validateResolvedDocument(d)).toEqual([]);
});
it.each([
 ['missing members',{}],['null members',{members:null}],['wrong members',{members:'bad'}],['missing label',{members:[]}],['wrong label',{name:7,members:[]}],['empty label',{name:' ',members:[]}]
])('reports indexed data errors: %s',(_name,value)=>{
 const t=groupLabelTemplate(),v=ok(validateTemplate(t)),r=prepareGeneration(v,groupLabelRequest(t,[value]));
 expect(r.ok).toBe(false);if(!r.ok)expect(r.issues.some(i=>i.path.includes('companies[0]'))).toBe(true);
});
it.each([
 ['wrong cell',(f:any)=>f.rowGroups[0].groupLabel.cellTemplateId='beforeCell'],
 ['same cells',(f:any)=>f.rowGroups[0].groupLabel.emptyCellTemplateId='memberLabelCell'],
 ['unknown field',(f:any)=>f.rowGroups[0].groupLabel.suffix=' (ต่อ)'],
 ['false keepStart',(f:any)=>f.rowGroups[0].pagination.keepStart=false],
 ['manual span one',(f:any)=>f.fragment.nodes.memberLabelCell.props.rowSpan=1],
 ['manual span two',(f:any)=>f.fragment.nodes.memberLabelCell.props.rowSpan=2],
 ['column mismatch',(f:any)=>f.fragment.nodes.emptyLabelCell.props.columnIndex=1],
 ['span mismatch',(f:any)=>f.fragment.nodes.emptyLabelCell.props.colSpan=2],
 ['label scope',(f:any)=>f.fragment.nodes.memberLabelText.children[0].scope='item'],
 ['different label keys',(f:any)=>f.fragment.nodes.emptyLabelText.children[0].key='members'],
 ['optional label',(f:any)=>f.inputSchema.fields.companies.items.fields.name.required=false],
 ['empty label schema',(f:any)=>delete f.inputSchema.fields.companies.items.fields.name.allowEmpty],
 ['link label',(f:any)=>{f.fragment.nodes.memberLabelText.children[0]={id:'link-label',type:'link',text:'X',url:'https://example.com'};}],
 ['anchored label',(f:any)=>f.fragment.nodes.memberLabelText.props.anchorId='label-anchor'],
 ['breakable empty',(f:any)=>f.fragment.nodes.empty.props.allowBreak=true],
 ['cell repeat label',(f:any)=>f.cellRepeats=[{id:'labels',cellId:'memberLabelCell',childTemplateIds:['memberLabelText'],source:{scope:'local',key:'companies'}}]],
 ['overlap',(f:any)=>f.rowGroups.push({...structuredClone(f.rowGroups[0]),id:'other'})]
])('rejects invalid declaration: %s',(_name,edit)=>{
 const t=groupLabelTemplate();edit(t.areaFormats.meeting);const r=validateTemplate(t);expect(r.ok).toBe(false);if(!r.ok)expect(r.issues.some(i=>i.code==='INVALID_TEMPLATE')).toBe(true);
});
it.each(['memberCount','cellId','sourceCellId','span','itemIndex','labelSource','removeMetadata','crossBoundary'])('rejects forged resolved label provenance: %s',edit=>{
 const d=compose(),t=table(d),g=t.rowGroups[0],label=d.nodes[g.groupLabel.cellId];
 if(edit==='memberCount')g.groupLabel.memberCount++;
 if(edit==='cellId')g.groupLabel.cellId=d.nodes[g.rowIds[1]].cellIds[0];
 if(edit==='sourceCellId')g.groupLabel.sourceCellId='bad';
 if(edit==='span')label.props.rowSpan=1;
 if(edit==='itemIndex')d.sourceMap[label.id].itemIndex=0;
 if(edit==='labelSource')d.sourceMap[label.childIds[0]].groupIndex=1;
 if(edit==='removeMetadata')delete g.groupLabel;
 if(edit==='crossBoundary')label.props.rowSpan++;
 expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
it('rejects the feature on model18 while retaining original model18 and model19 rowGroups',()=>{
 const t=groupLabelTemplate(),s=t.sections[0];t.nodeModelVersion=18;s.key='main';s.formats={};delete s.nameBase;expect(validateTemplate(t).ok).toBe(false);
 const old=rowGroupTemplate(),v=ok(validateTemplate(old));expect(composeDocument(v,ok(prepareGeneration(v,rowGroupRequest()))).ok).toBe(true);
 const newer=rowGroupTemplate(),ns=newer.sections[0];newer.nodeModelVersion=19;ns.id='10000000-0000-4000-8000-000000000011';ns.label='Original';ns.nameBase='Original';delete ns.key;delete ns.formats;
 const nv=ok(validateTemplate(newer));expect(composeDocument(nv,ok(prepareGeneration(nv,groupLabelRequest(newer)))).ok).toBe(true);
});
