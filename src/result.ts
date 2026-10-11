export interface Issue { code: string; groupId?:string;groupIndex?:number; path: string; message: string; nodeId?:string;sectionId?:string; contentIndex?:number; format?:string; expectedType?:string; actualType?:string; action?:'ignored'|'skipped' }
export type Result<T> =
  | { ok: true; value: T; warnings: Issue[] }
  | { ok: false; issues: Issue[]; warnings: Issue[] };
