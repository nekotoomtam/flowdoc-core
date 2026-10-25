import { required } from './types.js';
import { fail } from './types.js';
export function toPoints(x: any, path = 'length'): number { if (!x || typeof x !== 'object' || Object.keys(x).some(k => !['value', 'unit'].includes(k)) || !['pt', 'mm'].includes(x.unit) || !Number.isFinite(x.value) || x.value < 0)
    fail('DOCX_INPUT_INVALID', path, 'Expected nonnegative finite pt/mm length'); return x.value * (x.unit === 'mm' ? 72 / 25.4 : 1); }
export function toTwips(x: any, path = 'length'): number { const n = Math.round(toPoints(x, path) * 20); if (!Number.isSafeInteger(n) || n > 31680)
    fail('DOCX_GEOMETRY_UNREPRESENTABLE', path, 'Length exceeds profile1 native Word length range'); return n; }
export function columnGrid(columns: readonly any[]): number[] { let total = 0, last = 0; return columns.map((x, i) => { total += toPoints(x, `columns.${i}`) * 20; const next = Math.round(total), w = next - last; last = next; if (w <= 0 || !Number.isSafeInteger(next) || next > 31680)
    fail('DOCX_GEOMETRY_UNREPRESENTABLE', `columns.${i}`, 'Column grid must have positive representable widths'); return w; }); }
