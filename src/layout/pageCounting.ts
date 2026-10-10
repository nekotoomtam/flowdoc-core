import type {DrawDocument} from '../pdf/drawContract.js';
export function assignCountedPages(draw:DrawDocument):void {
 let number=0;
 for(const page of draw.pages)if(page.pageRole!==undefined)page.countedPageNumber=page.pageRole==='cover'?null:++number;
}
