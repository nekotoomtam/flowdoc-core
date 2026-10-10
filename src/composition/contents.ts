import type {ResolvedDocument,TextBlock} from './resolvedDocument.js';
import {linkLabel} from './linkContract.js';
import {LayoutError} from '../layout/textFlow.js';
// Current model support ceiling; indentation and stored level stay numeric.
export const MAX_CONTENTS_LEVEL=3;
export interface ContentsEntry {nodeId:string;anchorId:string;level:number;title:string}
export const contentsTitle=(node:TextBlock):string=>node.children.map(c=>c.type==='text'?c.text:c.type==='line-break'?' ':linkLabel(c)).join('').replace(/\s+/gu,' ').trim();
export function collectContents(document:ResolvedDocument):ContentsEntry[]{
 const roots=document.nodeModelVersion>=13?document.sections!.filter(s=>s.role!=='cover').flatMap(s=>s.rootIds):document.rootIds;
 const result:ContentsEntry[]=[],pending=[...roots].reverse();
 while(pending.length){const id=pending.pop()!,node=document.nodes[id]!;
  if(node.type==='text-block'&&node.props.toc){const title=contentsTitle(node);if(!title)throw new LayoutError(id,'Contents heading is empty');result.push({nodeId:id,anchorId:node.props.anchorId!,level:node.props.toc.level,title});}
  else if(node.type==='table')pending.push(...[...node.rowIds].reverse());
  else if(node.type==='table-row')pending.push(...[...node.cellIds].reverse());
  else if(node.type==='table-cell')pending.push(...[...node.childIds].reverse());
 }
 return result;
}
