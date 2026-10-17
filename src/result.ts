export interface FormatDiagnostic {version:1;areaId:string;areaEntryIndex:number;areaFormatId:string;format:string;reason:string;pending?:import('./layout/formatLayout.js').FormatCursor[];sectionPageIndex?:number;requiredHeightPt?:number;availableHeightPt?:number}
export interface Issue {reason?:string;formatOmission?:FormatDiagnostic;formatFrameOmission?:FormatDiagnostic;formatImageOmission?:FormatDiagnostic; code: string; groupId?:string;groupIndex?:number; path: string; message: string; nodeId?:string;sectionId?:string; contentIndex?:number; format?:string; expectedType?:string; actualType?:string; action?:'ignored'|'skipped' }
export type Result<T> =
  | { ok: true; value: T; warnings: Issue[] }
  | { ok: false; issues: Issue[]; warnings: Issue[] };
