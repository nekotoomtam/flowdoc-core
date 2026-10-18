import {rowGroupTemplate} from './rowGroups.js';

export const sectionId='10000000-0000-4000-8000-000000000011';
export function groupLabelTemplate():any {
 const t=rowGroupTemplate(),s=t.sections[0],f=t.areaFormats.meeting;
 t.nodeModelVersion=19;s.id=sectionId;s.label='Results 1';s.nameBase='Results';delete s.key;delete s.formats;
 f.inputSchema.fields.companies.items.fields.name.allowEmpty=false;
 const n=f.fragment.nodes;
 for(const rid of ['company','labels'])for(const id of [rid,rid+'Cell',rid+'Text'])delete n[id];
 n.table.rowIds=['before','member','empty','after'];
 n.table.columns=[{width:{value:80,unit:'pt'}},{width:{value:120,unit:'pt'}}];
 for(const rid of n.table.rowIds)n[rid+'Cell'].props={columnIndex:0,colSpan:2};
 for(const rid of ['member','empty']){
  n[rid+'Cell'].props={columnIndex:1};
  const cell=rid+'LabelCell',text=rid+'LabelText';
  n[rid].cellIds.unshift(cell);
  n[cell]={id:cell,type:'table-cell',props:{columnIndex:0},childIds:[text]};
  n[text]={id:text,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:rid+'LabelRef',type:'field-ref',scope:'group',key:'name'}]};
 }
 n.empty.props.allowBreak=false;
 f.rowGroups[0].rowTemplateIds=['member','empty'];
 f.rowGroups[0].pagination={keepStart:true};
 f.rowGroups[0].groupLabel={cellTemplateId:'memberLabelCell',emptyCellTemplateId:'emptyLabelCell'};
 return t;
}
export const groupLabelRequest=(t=groupLabelTemplate(),companies:any[]=[{name:'Same',members:[{name:'A'},{name:'B'}]},{name:'Same',members:[]}])=>({docKey:t.docKey,data:{},sections:[{id:t.sections[0].id,data:{details:[{format:'meeting',data:{companies}}]}}]});
