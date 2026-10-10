import {toPt} from '../composition/resolvedDocument.js';
import type {ResolvedDocument,TextStyle} from '../composition/resolvedDocument.js';
import type {DrawDocument} from '../pdf/drawContract.js';
import type {TextRuntime} from './textFlow.js';
import {LayoutError} from './textFlow.js';
import {measureNumber} from './fillContentsNumbers.js';
export async function appendPageNumbers(document:ResolvedDocument,draw:DrawDocument,runtime:TextRuntime):Promise<void>{
 const node=document.nodeModelVersion>=8?document.rootIds.map(id=>document.nodes[id]).find(n=>n?.type==='table-of-contents'):undefined;
 if(!node)return;
 const style:TextStyle={fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:10,unit:'pt'},lineHeightPt:14};
 for(const [i,page] of draw.pages.entries()){
 if(page.pageRole==='cover'||page.pageRole==='blank')continue;
 const section=(document.nodeModelVersion===12||document.nodeModelVersion===13||document.nodeModelVersion===14||document.nodeModelVersion===15)?document.sections!.find(s=>s.sectionId===page.sectionId):undefined;
 const margin=(section?.page??document.book.page).margin,bottom=toPt(margin.bottom),left=toPt(margin.left),right=toPt(margin.right);
 if(bottom<18)throw new LayoutError(section?.rootIds[0]??node.id,'Bottom margin must be at least 18 pt for page numbers');

  const run=await measureNumber(node.id,String(page.countedPageNumber??i+1),style,page.widthPt-left-right,runtime);
  page.commands.push({...run,id:`page-number-${i}`,bounds:{...run.bounds,xPt:left+run.bounds.xPt,yPt:page.heightPt-bottom+(bottom-14)/2}});
 }
}
