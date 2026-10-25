import { required } from './types.js';
import { fail, type NormalizedText } from './types.js';
export function normalizeBlock(node: any, path: string, scope: string, language?: string): NormalizedText {
    let raw = '';
    const ranges: {
        c: any;
        start: number;
        end: number;
    }[] = [];
    for (const c of node.children) {
        const start = raw.length;
        raw += c.type === 'system-page-field' ? '' : c.type === 'line-break' ? '\n' : c.type === 'url' ? c.value : c.text;
        ranges.push({ c, start, end: raw.length });
    }
    let text = '';
    const map = [0];
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '\r') {
            text += '\n';
            map.push(text.length);
            if (raw[i + 1] === '\n') {
                i++;
                map.push(text.length);
            }
        }
        else {
            text += ch === '\t' ? ' ' : ch;
            map.push(text.length);
        }
    }
    const segments: NormalizedText['segments'][number][] = [], boundaries = new Set<number>([0, text.length]);
    for (const g of new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(text)) {
        if (/\p{Bidi_Control}/u.test(g.segment) || [...g.segment].some(ch => !/[\p{Script_Extensions=Thai}\p{Script_Extensions=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(ch)))
            fail('DOCX_CAPABILITY_UNSUPPORTED', path, 'Text script/direction is outside the Thai/Latin intent profile', node.id);
        const script = /\p{Script_Extensions=Thai}/u.test(g.segment) ? 'Thai' : /\p{Script_Extensions=Latin}/u.test(g.segment) ? 'Latin' : 'Common';
        boundaries.add(g.index);
        boundaries.add(g.index + g.segment.length);
        const prev = segments.at(-1);
        if (prev?.script === script) {
            prev.text += g.segment;
            prev.end += g.segment.length;
        }
        else
            segments.push({ text: g.segment, start: g.index, end: g.index + g.segment.length, script });
    }
    const spans = ranges.map(({ c, start, end }) => { const a = required(map[start], 'text.range.start'), b = required(map[end], 'text.range.end'); if (!boundaries.has(a) || !boundaries.has(b))
        fail('DOCX_CAPABILITY_UNSUPPORTED', path + '.children.' + c.id, 'Inline boundary splits a grapheme cluster', node.id); return { id: c.id, type: c.type, range: [a, b] as const, ...(c.target ? { target: c.target } : {}), ...(c.url || c.type === 'url' ? { url: c.url ?? c.value } : {}), ...(c.field ? { field: c.field } : {}) }; });
    return { nodeId: node.id, path, scope, styleId: node.props.textStyleId, text, sourceToNormalized: map, spans, segments, ...(language ? { language } : {}) };
}
export function ownsPoint(text: string, start: number, end: number, point: number) { return point >= start && (point < end || point === end && (end === text.length || text[end] === '\n')); }
