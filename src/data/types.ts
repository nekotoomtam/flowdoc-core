import type {Issue} from '../result.js';
export type PreparedData=Record<string,string|Record<string,string>[]>;
export interface PreparedInput {
 schemaVersion:1;template:{templateId:string;docKey:string;version:number;fingerprint:string};
 data:PreparedData;content:{originalIndex:number;format:string;data:PreparedData}[];
 originalContentCount:number;skippedContentIndices:number[];warnings:Issue[];
}
