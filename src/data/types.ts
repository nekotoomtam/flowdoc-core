import type {BoundLink} from '../composition/linkContract.js';
export interface PreparedItem {[key:string]:string|BoundLink|PreparedItem[]}
import type {Issue} from '../result.js';
export interface PreparedAreaValue {kind:'area';originalCount:number;entries:{originalIndex:number;format:string;formatId:string;data:PreparedData}[];skippedIndices:number[]}
export type PreparedData=Record<string,string|BoundLink|PreparedItem[]|PreparedAreaValue>;
export interface PreparedInput {
 schemaVersion:1|2|3;template:{templateId:string;docKey:string;version:number;fingerprint:string;nodeModelVersion?:19|20};
 sections?:Record<string,PreparedSection>|(PreparedSection19|PreparedSection20)[];
 header?:PreparedData;footer?:PreparedData;
 data:PreparedData;content:{originalIndex:number;format:string;data:PreparedData}[];
 originalContentCount:number;skippedContentIndices:number[];warnings:Issue[];
}

export interface PreparedSection {key:string;data:PreparedData;header?:PreparedData;footer?:PreparedData;content:PreparedInput['content'];originalContentCount:number;skippedContentIndices:number[];warnings:Issue[]}

export interface PreparedSection20 extends PreparedSection19 {sectionKey:string;instanceKey:string}

export interface PreparedSection19 {id:string;data:PreparedData;header?:PreparedData;footer?:PreparedData}
