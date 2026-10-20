import type {ObjectSchema} from './types.js';
import {object,keys,name,own} from './checks.js';

// This feature owns only these two cells. General grid/span validation stays in validateGraph.
export function validGroupLabel(r:Record<string,any>,nodes:Record<string,any>,schema:ObjectSchema):boolean {
 const label=r.groupLabel;
 if(!object(label)||!keys(label,['cellTemplateId','emptyCellTemplateId'])||!name(label.cellTemplateId)||!name(label.emptyCellTemplateId)||label.cellTemplateId===label.emptyCellTemplateId||r.pagination?.keepStart===false)return false;
 let column:number|undefined,span:number|undefined,key:string|undefined;
 for(const [rowId,cellId] of [[r.memberRepeat.rowTemplateId,label.cellTemplateId],[r.memberRepeat.emptyRowTemplateId,label.emptyCellTemplateId]]){
  const row=nodes[rowId],cell=nodes[cellId];
  if(row?.type!=='table-row'||!Array.isArray(row.cellIds)||!row.cellIds.includes(cellId)||cell?.type!=='table-cell'||!object(cell.props)||own(cell.props,'rowSpan')||!Number.isSafeInteger(cell.props.columnIndex)||cell.props.columnIndex<0||!Array.isArray(cell.childIds)||cell.childIds.length!==1)return false;
  const text=nodes[cell.childIds[0]];
  if(text?.type!=='text-block'||!object(text.props)||text.props.heightMode==='fixed'||own(text.props,'anchorId')||own(text.props,'toc')||!Array.isArray(text.children)||text.children.length!==1)return false;
  const ref=text.children[0];
  if(!object(ref)||ref.type!=='field-ref'||ref.scope!=='group'||!name(ref.key)||!own(schema.fields,ref.key))return false;
  const field=schema.fields[ref.key];
  if(field?.type!=='string'||field.required!==true||field.allowEmpty!==false)return false;
  const cs=cell.props.colSpan??1;
  if(column!==undefined&&(column!==cell.props.columnIndex||span!==cs||key!==ref.key))return false;
  column=cell.props.columnIndex;span=cs;key=ref.key;
 }
 return nodes[r.memberRepeat.emptyRowTemplateId]?.props?.allowBreak===false;
}
