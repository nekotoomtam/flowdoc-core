export interface Glyph {
  glyphId: number; advancePt: number; offsetXPt: number; offsetYPt: number;
  clusterStartOffset: number; clusterEndOffset: number;
}
export interface GlyphRun {
  id: string; nodeId: string; kind: 'glyph-run'; text: string; fontId: string;
  fontSizePt: number; lineHeightPt: number; baselineOffsetPt: number; color: string;
  bounds: {xPt:number;yPt:number;widthPt:number;heightPt:number}; glyphs: Glyph[];
}
export interface DrawPage {widthPt:number;heightPt:number;backgroundColor:string;commands:GlyphRun[]}
export interface DrawDocument {pages:DrawPage[]}
export interface PdfFontResource {fontId:string;subsetBytes:Uint8Array;subsetPrefix:string;postScriptName:string}
