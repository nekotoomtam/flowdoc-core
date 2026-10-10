import type {BoundLink} from '../composition/linkContract.js';
export type PreparedItem=Record<string,string|BoundLink>;
import type {Issue} from '../result.js';
export interface PreparedAreaValue {kind:'area';originalCount:number;entries:{originalIndex:number;format:string;formatId:string;data:PreparedData}[];skippedIndices:number[]}
export type PreparedData=Record<string,string|BoundLink|PreparedItem[]|PreparedAreaValue>;
export interface PreparedInput {
 schemaVersion:1;template:{templateId:string;docKey:string;version:number;fingerprint:string};
 header?:PreparedData;footer?:PreparedData;
 data:PreparedData;content:{originalIndex:number;format:string;data:PreparedData}[];
 originalContentCount:number;skippedContentIndices:number[];warnings:Issue[];
}
