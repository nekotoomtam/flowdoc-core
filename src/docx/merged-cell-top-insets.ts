export interface MergedCellTopInsetInput {
 cellId:string; rowIds:readonly string[]; sourceTopTwips:number; nativeTopTwips:number;
 peerTopTwips:readonly (readonly number[])[]; ineligibleReason?:string;
}
export interface MergedCellTopInsetDecision {
 cellId:string;rowIds:readonly string[];sourceTopTwips:number;physicalTopTwips:number;
 firstLabelBeforeTwips:number;policy:'retain-native'|'peer-top-and-single-label-offset';reason:string;wordVerified:false;
}
/** Represent the logical inset once; physical continuation rows must not repeat it. */
export function deriveMergedCellTopInset(input:MergedCellTopInsetInput):MergedCellTopInsetDecision {
 const retain=(reason:string):MergedCellTopInsetDecision=>({cellId:input.cellId,rowIds:[...input.rowIds],sourceTopTwips:input.sourceTopTwips,physicalTopTwips:input.nativeTopTwips,firstLabelBeforeTwips:0,policy:'retain-native',reason,wordVerified:false});
 if(input.ineligibleReason)return retain(input.ineligibleReason);
 const valid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 if(input.rowIds.length<2||new Set(input.rowIds).size!==input.rowIds.length)return retain('not-a-merged-label');
 if(!valid(input.sourceTopTwips)||!valid(input.nativeTopTwips)||input.sourceTopTwips!==input.nativeTopTwips)return retain('unproven-source-inset');
 if(input.peerTopTwips.length!==input.rowIds.length||input.peerTopTwips.some(row=>!row.length||row.some(n=>!valid(n))))return retain('missing-or-invalid-peers');
 const peer=input.peerTopTwips[0]![0]!;
 if(input.peerTopTwips.some(row=>row.some(n=>n!==peer)))return retain('mixed-peer-tops');
 if(input.sourceTopTwips<peer)return retain('source-top-below-peer');
 if(input.sourceTopTwips===peer)return retain('uniform-top');
 return {cellId:input.cellId,rowIds:[...input.rowIds],sourceTopTwips:input.sourceTopTwips,physicalTopTwips:peer,firstLabelBeforeTwips:input.sourceTopTwips-peer,policy:'peer-top-and-single-label-offset',reason:'validated-merged-label-uniform-peers',wordVerified:false};
}
