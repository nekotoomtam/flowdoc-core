export interface ResourceOptions { pythonExecutable: string; tempRoot: string }
export interface FontResource {
 id:string;path:string;sha256:string;
 selection?:{releaseId:string;faceId:string;assetId:string;weight:number;style:'normal'|'italic'};
 licenses?:import('../fonts/types.js').FontLicense[];
}
export interface ExportResources extends ResourceOptions {
  shaperPath: string;
  segmenterPath: string;
  subsetHelperPath: string;
  fonts: FontResource[];
}
