export interface Issue { code: string; path: string; message: string }
export type Result<T> =
  | { ok: true; value: T; warnings: Issue[] }
  | { ok: false; issues: Issue[]; warnings: Issue[] };
