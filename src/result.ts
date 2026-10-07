export interface Issue { code: string; path: string; message: string; nodeId?:string; contentIndex?:number; format?:string; expectedType?:string; actualType?:string; action?:'ignored'|'skipped' }
export type Result<T> =
  | { ok: true; value: T; warnings: Issue[] }
  | { ok: false; issues: Issue[]; warnings: Issue[] };
