import type {Length,LineBlock,Table} from './resolvedDocument.js';
export const STROKE_KINDS=['single','none','dashed','dotted','double','dashSmallGap','thickThinWideGap'] as const;
export type StrokeKind=typeof STROKE_KINDS[number];
export const TABLE_BORDER_SIDES=['top','right','bottom','left','insideHorizontal','insideVertical','headerBottom'] as const;
export type TableBorderSide=typeof TABLE_BORDER_SIDES[number];
export interface BorderStroke {style?:StrokeKind;width?:Length;color?:string}
export interface ResolvedStroke {style:StrokeKind;widthPt:number;color:string}
const own=(o:object,k:string)=>Object.hasOwn(o,k);
const object=(x:unknown):x is Record<string,any>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const widthPt=(l:Length)=>l.unit==='mm'?l.value*72/25.4:l.value;
export const strokeEnvelope=(s:ResolvedStroke)=>s.widthPt*(s.style==='double'?3:1);
export const strokePaintProps=(s:ResolvedStroke)=>({widthPt:s.widthPt,color:s.color,...(s.style==='single'?{}:{style:s.style as Exclude<StrokeKind,'none'>})});
export function portableStrokeWidth(raw:unknown,kind?:StrokeKind):boolean{
 if(!object(raw)||Object.keys(raw).some(k=>!['value','unit'].includes(k))||!['pt','mm'].includes(raw.unit)||typeof raw.value!=='number'||!Number.isFinite(raw.value))return false;
 const p=widthPt(raw as unknown as Length),scale=kind==='thickThinWideGap'||kind==='none'?12700:8;return p>=.25&&p<=12&&Math.abs(p*scale-Math.round(p*scale))<1e-6;
}
export function tableStrokeErrors(p:Record<string,any>):string[]{
 const errors:string[]=[];
 if(own(p,'borderStyle')&&!STROKE_KINDS.includes(p.borderStyle))errors.push('borderStyle');
 if(own(p,'borderWidth')&&!portableStrokeWidth(p.borderWidth,p.borderStyle))errors.push('borderWidth');
 if(own(p,'borders')){
  if(!object(p.borders)||Object.keys(p.borders).some(k=>!TABLE_BORDER_SIDES.includes(k as TableBorderSide)))errors.push('borders');
  else for(const [side,s] of Object.entries(p.borders)){
   if(!object(s)||Object.keys(s).some(k=>!['style','width','color'].includes(k))){errors.push('borders.'+side);continue;}
   if(own(s,'style')&&!STROKE_KINDS.includes(s.style))errors.push('borders.'+side+'.style');
   if(own(s,'width')?!portableStrokeWidth(s.width,s.style??p.borderStyle):p.borderWidth!==undefined&&!portableStrokeWidth(p.borderWidth,s.style??p.borderStyle))errors.push('borders.'+side+'.width');
   if(own(s,'color')&&(typeof s.color!=='string'||!/^[a-f\d]{6}$/i.test(s.color)))errors.push('borders.'+side+'.color');
  }
 }
 return errors;
}
export function lineStrokeErrors(p:Record<string,any>):string[]{
 if(!own(p,'lineStyle'))return [];
 if(p.lineStyle==='thickThinWideGap')return ['lineStyle'];
 if(!STROKE_KINDS.includes(p.lineStyle))return ['lineStyle'];
 return p.lineStyle!=='single'&&p.thickness!==undefined&&!portableStrokeWidth(p.thickness)?['thickness']:[];
}
export function resolveLineStroke(n:LineBlock):ResolvedStroke{return {style:n.props.lineStyle??'single',widthPt:n.props.thickness?widthPt(n.props.thickness):.5,color:n.props.color??'000000'};}
export function resolveTableStroke(t:Table,side:TableBorderSide):ResolvedStroke{
 const p=t.props,s=p.borders?.[side]??(side==='headerBottom'?p.borders?.insideHorizontal:undefined);
 return {style:s?.style??p.borderStyle??'single',widthPt:s?.width?widthPt(s.width):p.borderWidth?widthPt(p.borderWidth):.5,color:s?.color??p.borderColor??'000000'};
}
/** Existing half-point accommodations are proven only for the original uniform profile. */
export function hasCompoundTableStroke(t:Table){return TABLE_BORDER_SIDES.some(s=>resolveTableStroke(t,s).style==='thickThinWideGap');}
export function legacyTableStrokeGeometry(t:Table):boolean{return !t.props.borders&&[undefined,'single','none'].includes(t.props.borderStyle)&&Math.abs((t.props.borderWidth?widthPt(t.props.borderWidth):.5)-.5)<1e-8;}
export function tableStrokeEnvelope(t:Table):number{
 const active=TABLE_BORDER_SIDES.filter(side=>side==='headerBottom'?t.props.headerRowCount>0&&t.rowIds.length>t.props.headerRowCount:side==='insideHorizontal'?t.rowIds.length>t.props.headerRowCount+1:side==='insideVertical'?t.columns.length>1:true);
 return Math.max(0,...active.map(side=>resolveTableStroke(t,side)).filter(s=>s.style!=='none').map(strokeEnvelope));
}
