import type {TextStyle} from '../composition/resolvedDocument.js';
export interface ContentsSlot {nodeId:string;anchorId:string;pageIndex:number;xPt:number;yPt:number;widthPt:number;style:TextStyle}
import type {BoundLink} from '../composition/linkContract.js';
export interface LinkSpan {id:string;start:number;end:number;link:BoundLink}
export interface LinkAnnotation {nodeId:string;linkId:string;rect:{xPt:number;yPt:number;widthPt:number;heightPt:number};destination:{type:'external';url:string}|{type:'internal';target:string}}
export interface Glyph {
  glyphId: number; advancePt: number; offsetXPt: number; offsetYPt: number;
  clusterStartOffset: number; clusterEndOffset: number;
}
export interface GlyphRun {
  id: string; nodeId: string; kind: 'glyph-run'; text: string; fontId: string;
  fontSizePt: number; lineHeightPt: number; baselineOffsetPt: number; color: string;
  sourceStart?:number; links?:LinkSpan[]; glyphInkBoundsPt?:({left:number;right:number}|null)[];
  bounds: {xPt:number;yPt:number;widthPt:number;heightPt:number}; glyphs: Glyph[];
}
export interface Border {x1Pt:number;y1Pt:number;x2Pt:number;y2Pt:number;widthPt:number;color:string;nodeId:string}
export interface DrawImage {resourceId:string;nodeId:string;xPt:number;yPt:number;widthPt:number;heightPt:number}
export interface DrawPage {widthPt:number;heightPt:number;backgroundColor:string;commands:GlyphRun[];borders?:Border[];images?:DrawImage[];annotations?:LinkAnnotation[]}
export interface DrawDocument {pages:DrawPage[];contentsSlots?:ContentsSlot[];anchors?:Record<string,{pageIndex:number;xPt:number;yPt:number}>}
export interface PdfFontResource {fontId:string;subsetBytes:Uint8Array;subsetPrefix:string;postScriptName:string}
