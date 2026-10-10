import type {ResolvedDocument} from '../composition/resolvedDocument.js';
import type {DrawDocument} from '../pdf/drawContract.js';
import {normalizeNumbering} from '../template/pageNumbering.js';
import {LayoutError} from './textFlow.js';
export function assignSystemPageNumbers(document:ResolvedDocument,draw:DrawDocument):void {
 if(document.nodeModelVersion!==16)return;
 const sections=new Map(document.sections!.map(s=>[s.sectionId,s])),seen=new Set<string>();let last=0,total=0;
 for(const page of draw.pages){const s=sections.get(page.sectionId!);if(!s)throw new LayoutError('page','Unknown page Section',page.sectionId);
  const n=normalizeNumbering(s),first=!seen.has(s.sectionId);seen.add(s.sectionId);let current:number|null=null;
  if(n.mode!=='exclude'){current=first&&n.mode==='restart'?n.startAt!:last+1;if(!Number.isSafeInteger(current)||current<1)throw new LayoutError(s.rootIds[0]??'page','Page number exceeds safe integer',s.sectionId,'numbering');last=current;total++;}
  page.pageNumbering={current,total:0,visibility:page.pageRole==='cover'||page.pageRole==='blank'?'hide':n.visibility!};page.countedPageNumber=current;
 }
 for(const page of draw.pages)page.pageNumbering!.total=total;
}
