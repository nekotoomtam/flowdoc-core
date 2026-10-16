export type FontSelection={kind:'unselected'}|{kind:'library';releaseId:string;weight:number;style:'normal'|'italic'};
export interface LibraryTextStyle {font:FontSelection;fontSize:{value:number;unit:'pt'};lineHeightPt:number}
export interface FontLicense {id:string;path:string;sha256:string}
export interface LibraryFontInput {
 releaseId:string;faceId:string;assetId:string;weight:number;style:'normal'|'italic';
 path:string;sha256:string;licenses:FontLicense[];
}
export class FontError extends Error {
 constructor(public readonly code:string,public readonly path='/font'){super('Requested font could not be used');}
}
