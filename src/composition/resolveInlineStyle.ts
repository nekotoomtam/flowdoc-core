import type {TextStyle,InlineStyleOverride} from './resolvedDocument.js';

export function resolveInlineStyle(base:TextStyle,override?:InlineStyleOverride,styles?:Record<string,TextStyle>):TextStyle {
 let result=base;
 const family=override?.familyStyleId&&styles?.[override.familyStyleId];
 if(family&&'font' in base&&'font' in family&&base.font.kind==='library'&&family.font.kind==='library'){
  result={...base,font:{...base.font,releaseId:family.font.releaseId}};
 }
 if(override?.color!==undefined)result={...result,color:override.color};
 if(override?.underline!==undefined)result={...result,underline:override.underline};
 if(override?.fontSizePt!==undefined)result={...result,fontSize:{unit:'pt',value:override.fontSizePt}};
 if(override?.bold===undefined && override?.italic===undefined)return result;
 if('font' in result){
  if(result.font.kind==='unselected')return result;
  return {...result,font:{...result.font,weight:override.bold===undefined?result.font.weight:(override.bold?700:400),style:override.italic===undefined?result.font.style:(override.italic?'italic':'normal')}};
 }
 return {...result,fontWeight:override.bold===undefined?result.fontWeight:(override.bold?'bold':'normal'),...(override.italic===undefined?{}:{fontStyle:override.italic?'italic':'normal'})};
}
