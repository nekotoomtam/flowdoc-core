import type {BoundLink} from './linkContract.js';
export interface Length {value:number;unit:'mm'|'pt'}
export interface TextStyle {
  fontFamilyKey:'sarabun';fontWeight:'normal'|'bold';fontStyle?:'normal'|'italic';
  fontSize:{value:number;unit:'pt'};lineHeightPt:number;
}
export type TextInline={id:string;type:'text';text:string}|{id:string;type:'line-break'}|({id:string}&BoundLink);
export interface TextBlock {
  id:string;type:'text-block';role:{role:'paragraph'};
  props:{textStyleId:string;sizing?:{mode:'content'};anchorId?:string;toc?:{level:number}};children:TextInline[];
}
export type SourceOrigin={origin?:never;sectionId?:never;contentIndex:number;format:string}|{origin:'content';sectionId:string;contentIndex:number;format:string}|{origin:'authored';sectionId:string;contentIndex?:never;format?:never};
export type SourceEntry=SourceOrigin&{sourceId:string;itemIndex?:number;repeatId?:string;areaId?:string;areaEntryIndex?:number;areaFormatId?:string}
export interface Table {id:string;type:'table';props:{headerRowCount:number;repeatHeaderRows:boolean};columns:{width:Length}[];rowIds:string[]}
export interface TableRow {id:string;type:'table-row';props:{allowBreak:boolean};cellIds:string[]}
export type CellPadding=Partial<Record<'top'|'right'|'bottom'|'left',Length>>;
export interface TableCell {id:string;type:'table-cell';props:{columnIndex?:number;rowSpan?:number;colSpan?:number;padding?:CellPadding};childIds:string[]}
export interface ImageBlock {id:string;type:'image';props:{width:Length;height:Length;align?:'left'|'center'|'right';resourceId:string}}
export interface ContentsBlock {id:string;type:'table-of-contents';props:{textStyleId:string}}
export type DocumentNode=TextBlock|Table|TableRow|TableCell|ImageBlock|ContentsBlock;
export interface ResolvedDocument {
  schemaVersion:1;nodeModelVersion:4|5|6|7|8|9|10|11|12;template:{templateId:string;docKey:string;version:number};
  book:{contentSlot:'body';page:{size:'A4';orientation:'portrait'|'landscape';margin:{top:Length;right:Length;bottom:Length;left:Length}}};
  sections?:{sectionId:string;pageLayoutId:string;page:ResolvedDocument['book']['page'];rootIds:string[]}[];
  styles:Record<string,TextStyle>;rootIds:string[];nodes:Record<string,DocumentNode>;sourceMap:Record<string,SourceEntry>;
}
export function toPt(length:Length):number {return length.unit==='mm'?length.value*72/25.4:length.value;}
