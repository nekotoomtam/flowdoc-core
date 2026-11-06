import type {BoundLink} from '../composition/linkContract.js';
export interface PreparedItem {[key:string]:string|BoundLink|PreparedItem[]}
import type {Issue} from '../result.js';
export interface PreparedAreaValue {kind:'area';originalCount:number;entries:{originalIndex:number;format:string;formatId:string;data:PreparedData}[];skippedIndices:number[]}
export type PreparedData=Record<string,string|BoundLink|PreparedItem[]|PreparedAreaValue>;
export interface PreparedInput {
 schemaVersion:3;template:{templateId:string;docKey:string;version:number;fingerprint:string;nodeModelVersion:20};
 sections:PreparedSection20[];
 data:PreparedData;content:never[];
 originalContentCount:0;skippedContentIndices:never[];warnings:Issue[];
}
export interface PreparedSection20 {id:string;sectionKey:string;instanceKey:string;data:PreparedData;header?:PreparedData;footer?:PreparedData}
