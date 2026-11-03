import {setImmediate} from 'node:timers/promises';
import {fail} from './types.js';
import {countPackage,planGeneratedPackage,applyPlan,readStyleIds} from './compaction/package.mjs';
/** Private generation facts. Never supplied by callers or inferred from ID prefixes. */
export interface GeneratedCompactionContext {
 sourceSerialized:true;
 ownedStyleIds:ReadonlySet<string>;
 nativeStyleXml?:string;
 sections:readonly {sectionId:string;footerMode:'all'|'none'|'first'|'continuation';footerOwned:boolean}[];
}
export interface CompactionReceipt {changed:boolean;before:number;after:number;reason?:string}
export const generatedStyleIds=(xml:string):Set<string>=>new Set(readStyleIds(xml));
export async function compactGeneratedPackage(zip:any,context:GeneratedCompactionContext,options:{xmlBudget:number;signal?:AbortSignal}):Promise<CompactionReceipt>{
 const check=()=>{if(options.signal?.aborted)fail('DOCX_CANCELLED','options.signal','Export cancelled during XML compaction');};
 const checkpoint=async()=>{check();await setImmediate();check();};check();
 const before=await countPackage(zip);check();
 if(before<=options.xmlBudget)return {changed:false,before,after:before};
 let plan;
 try{plan=await planGeneratedPackage(zip,context,options.xmlBudget,checkpoint);}
 catch(error){check();return {changed:false,before,after:before,reason:error instanceof Error?error.message:'INELIGIBLE'};}
 if(!plan.ready)return {changed:false,before,after:before,reason:plan.reason??'INELIGIBLE'};
 await checkpoint();
 // Applying private staging edits has no await; failure propagates to writer
 // cleanup. Never swallow a partial application and publish the remaining ZIP.
 applyPlan(zip,plan);
 return {changed:true,before,after:plan.after};
}
