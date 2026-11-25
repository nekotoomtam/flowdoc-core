import type {TextStyle,InlineStyleOverride} from './resolvedDocument.js';

export function resolveInlineStyle(base:TextStyle,override?:InlineStyleOverride):TextStyle {
 let result=base;
 if(override?.fontSizePt!==undefined)result={...result,fontSize:{unit:'pt',value:override.fontSizePt}};
 if(override?.bold===undefined && override?.italic===undefined)return result;
 if('font' in result){
  if(result.font.kind==='unselected')return result;
  return {...result,font:{...result.font,weight:override.bold===undefined?result.font.weight:(override.bold?700:400),style:override.italic===undefined?result.font.style:(override.italic?'italic':'normal')}};
 }
 return {...result,fontWeight:override.bold===undefined?result.fontWeight:(override.bold?'bold':'normal'),...(override.italic===undefined?{}:{fontStyle:override.italic?'italic':'normal'})};
}
