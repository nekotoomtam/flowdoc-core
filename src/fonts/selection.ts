import type {TextStyle} from '../composition/resolvedDocument.js';
import type {FontResource} from '../runtime/exportResources.js';
import {FontError} from './types.js';
export function fontIdForStyle(style:TextStyle,runtime?:{fontId?:(style:TextStyle)=>string}):string{
 if(runtime?.fontId)return runtime.fontId(style);
 if('font' in style)throw new FontError(style.font.kind==='unselected'?'FONT_NOT_SELECTED':'FONT_FACE_UNAVAILABLE');
 return style.fontWeight==='bold'?(style.fontStyle==='italic'?'font-bold-italic':'font-bold'):(style.fontStyle==='italic'?'font-italic':'font-regular');
}
export function selectFont(style:TextStyle,fonts:readonly FontResource[]):FontResource{
 if(!('font' in style)){
  const found=fonts.find(f=>f.id===fontIdForStyle(style));if(!found)throw new FontError('FONT_FACE_UNAVAILABLE');return found;
 }
 const selection=style.font;if(selection.kind==='unselected')throw new FontError('FONT_NOT_SELECTED');
 const matches=fonts.filter(f=>f.selection?.releaseId===selection.releaseId&&f.selection.weight===selection.weight&&f.selection.style===selection.style);
 if(matches.length!==1)throw new FontError('FONT_FACE_UNAVAILABLE');return matches[0]!;
}
