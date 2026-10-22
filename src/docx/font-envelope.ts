import { required } from './types.js';
import type { ExportIntent } from './types.js';
import { fail } from './types.js';
import { intentResourceBytes } from './profile.js';
import { fieldDigitBudget } from './fields.js';
export function concreteFontBounds(intent: ExportIntent, fontId: string, sizeHalfPoints: number) {
    const b = Buffer.from(intentResourceBytes(intent, 'font', fontId)), tables = new Map<string, {
        o: number;
        l: number;
    }>();
    for (let i = 0; i < b.readUInt16BE(4); i++) {
        const at = 12 + i * 16;
        tables.set(b.toString('ascii', at, at + 4), { o: b.readUInt32BE(at + 8), l: b.readUInt32BE(at + 12) });
    }
    const head = tables.get('head')!, h = tables.get('hhea'), os = tables.get('OS/2')!;
    if (!h || h.l < 12 || os.l < 78)
        fail('DOCX_CAPABILITY_UNSUPPORTED', 'resources.fonts.' + fontId, 'Band/cover fit requires font metric tables');
    const units = b.readUInt16BE(head.o + 18), size = sizeHalfPoints / 2, maxWidth = Math.max(b.readUInt16BE(h!.o + 10), b.readInt16BE(head.o + 40) - b.readInt16BE(head.o + 36)) / units * size, maxHeight = Math.max(b.readInt16BE(head.o + 42) - b.readInt16BE(head.o + 38), b.readInt16BE(h!.o + 4) - b.readInt16BE(h!.o + 6) + Math.max(0, b.readInt16BE(h!.o + 8)), b.readUInt16BE(os.o + 74) + b.readUInt16BE(os.o + 76)) / units * size;
    return { maxWidth, maxHeight };
}
export function textEnvelope(intent: ExportIntent, nodeId: string, scope: string, width: number) {
    const block = intent.textBlocks.find(t => t.nodeId === nodeId && t.scope === scope)!, style = required(intent.styles[block.styleId], 'styles'), { maxWidth, maxHeight } = concreteFontBounds(intent, style.font.id, style.sizeHalfPoints);
    const lines = block.text.split('\n'), fields = block.spans.filter(s => s.type === 'system-page-field').length;
    const digits = fieldDigitBudget(intent);
    if (lines.some(line => (line.length + fields * digits) * maxWidth > width))
        fail('DOCX_CAPABILITY_UNSUPPORTED', scope + '.' + nodeId, 'Wrapping is outside the provisional band/cover envelope');
    return lines.length * Math.max(style.line.twips / 20, maxHeight);
}
