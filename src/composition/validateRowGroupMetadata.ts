import {object,keys,name,own,issue} from '../template/checks.js';
import type {Issue} from '../result.js';
export function validateRowGroupMetadata(d:Record<string,any>):Issue[]{
 const issues:Issue[]=[],covered=new Set<string>(),fail=(p:string)=>issues.push(issue('LAYOUT_FAILED',p,'Invalid row group boundary or source identity'));
 for(const [tableId,t] of Object.entries(d.nodes) as [string,any][]){
  if(t?.type!=='table'||!own(t,'rowGroups'))continue;
  const path='nodes.'+tableId+'.rowGroups';
  if(d.nodeModelVersion!==17||!Array.isArray(t.rowGroups)||!Array.isArray(t.rowIds)){fail(path);continue;}
  const groupRowIds=new Set<string>(),rowPositions=new Map<string,number>(t.rowIds.map((id:string,i:number)=>[id,i]));
  const nextIndex=new Map<string,number>();let previousEnd=t.props?.headerRowCount??0;
  for(const [index,g] of t.rowGroups.entries()){
   const p=path+`[${index}]`;
   if(!object(g)||!keys(g,['groupId','groupIndex','rowIds','prefixRowIds','firstMemberRowId','empty','keepStart'])||!name(g.groupId)||g.groupId.includes('~')||!Number.isSafeInteger(g.groupIndex)||g.groupIndex!==(nextIndex.get(g.groupId)??0)||!Array.isArray(g.rowIds)||!g.rowIds.length||!g.rowIds.every(name)||!Array.isArray(g.prefixRowIds)||!g.prefixRowIds.length||!g.prefixRowIds.every(name)||typeof g.empty!=='boolean'||typeof g.keepStart!=='boolean'){fail(p);continue;}
   nextIndex.set(g.groupId,g.groupIndex+1);
   const start=rowPositions.get(g.rowIds[0]!)??-1,prefix=g.prefixRowIds.length;
   if(start<previousEnd||g.rowIds.length<=prefix||g.rowIds.some((id:string,i:number)=>t.rowIds[start+i]!==id)||g.prefixRowIds.some((id:string,i:number)=>g.rowIds[i]!==id)||g.firstMemberRowId!==g.rowIds[prefix]||(g.empty&&g.rowIds.length!==prefix+1)){fail(p);continue;}
   previousEnd=start+g.rowIds.length;
   for(const rid of g.rowIds)groupRowIds.add(rid);
   for(const [r,rid] of g.rowIds.entries()){
    const itemIndex=r<prefix||g.empty?undefined:r-prefix,pending=[rid];
    while(pending.length){const id=pending.pop()!;if(covered.has(id)){fail(p);break;}covered.add(id);
     const s=d.sourceMap[id],node=d.nodes[id];
     if(!object(s)||s.groupId!==g.groupId||s.groupIndex!==g.groupIndex||s.itemIndex!==itemIndex||s.repeatId!==undefined){fail('sourceMap.'+id);continue;}
     if(node?.type==='table-row')pending.push(...node.cellIds);
     else if(node?.type==='table-cell'){if((node.props?.rowSpan??1)>1)fail(p);pending.push(...node.childIds);}
     else if(node?.type==='text-block')pending.push(...node.children.map((c:any)=>c.id));
    }
   }
  }
  for(const [row,rid] of t.rowIds.entries())for(const cid of d.nodes[rid].cellIds){const span=d.nodes[cid].props.rowSpan??1;if(span>1&&t.rowIds.slice(row,row+span).some((id:string)=>groupRowIds.has(id)))fail('nodes.'+cid+'.props.rowSpan');}
 }
 for(const [id,s] of Object.entries(d.sourceMap))if(object(s)&&(own(s,'groupId')||own(s,'groupIndex'))&&!covered.has(id))fail('sourceMap.'+id);
 return issues;
}
