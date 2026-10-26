import {BorderStyle} from 'docx';
import type {ResolvedStroke} from '../composition/strokeStyle.js';
export function nativeStroke(s:ResolvedStroke){
 const style={single:BorderStyle.SINGLE,none:BorderStyle.NONE,dashed:BorderStyle.DASHED,dotted:BorderStyle.DOTTED,double:BorderStyle.DOUBLE}[s.style];
 return {style,size:s.style==='none'?0:Math.round(s.widthPt*8),color:s.color};
}
