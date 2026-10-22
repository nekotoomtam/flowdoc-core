import { required } from './types.js';
import { Paragraph, TextRun, OnOffElement, LineRuleType, ExternalHyperlink, InternalHyperlink, type ParagraphChild, type IRunOptions, type IRunStylePropertiesOptions } from 'docx';
import type { ExportIntent, EffectiveStyle, Result } from './types.js';
import { capture, fail } from './types.js';
import { requireGenuineIntent } from './profile.js';
import { toTwips } from './units.js';
import { sourceGraph, pageField, bookmarkName, type NavigationContext } from './fields.js';
import { ownsPoint } from './text-intent.js';
// Undefined CS emphasis lets docx copy ordinary true AND false, overriding inheritance.
export function nativeRunStyle(style: EffectiveStyle, language?: string): IRunStylePropertiesOptions {
    return { font: { ascii: style.font.family, hAnsi: style.font.family, cs: style.font.family, eastAsia: style.font.family }, size: style.sizeHalfPoints, sizeComplexScript: style.sizeHalfPoints, bold: style.bold, italics: style.italic, snapToGrid: false, ...(language ? { language: { value: language, bidirectional: language } } : {}) };
}
class ScriptRun extends TextRun {
    constructor(options: IRunOptions, thai: boolean) { super(options); if (thai)
        this.properties.push(new OnOffElement('w:cs', true)); }
}
export function buildTextParagraph(intent: ExportIntent, nodeId: string, options: {
    start?: number;
    end?: number;
    keepNext?: boolean;
    keepLines?: boolean;
    spaceAfterTwips?: number;
    scope?: string;
    navigation?: NavigationContext;
} = {}): Result<{
    paragraph: Paragraph;
    receipt: {
        nodeId: string;
        logicalText: string;
        font: EffectiveStyle['font'];
        line: {
            rule: string;
            twips: number;
        };
        visualVerified: false;
    };
}> {
    return capture(() => {
        requireGenuineIntent(intent);
        const scope = options.scope ?? 'nodes', source: any = sourceGraph(intent, scope)[nodeId], block = intent.textBlocks.find(t => t.scope === scope && t.nodeId === nodeId), path = scope + '.' + nodeId;
        if (source?.type !== 'text-block' || !block)
            fail('DOCX_CAPABILITY_UNSUPPORTED', path, 'U2 requires a body text-block', nodeId);
        if (!options.navigation && (source.props.anchorId !== undefined || source.props.pageFieldLayout !== undefined || block.spans.some(s => !['text', 'line-break'].includes(s.type))))
            fail('DOCX_CAPABILITY_UNSUPPORTED', path, 'Navigation/fields require U4; no relationships are dropped', nodeId);
        const start = options.start ?? 0, end = options.end ?? block.text.length;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > block.text.length || (start !== 0 && block.text[start - 1] !== '\n') || (end !== block.text.length && block.text[end] !== '\n'))
            fail('DOCX_REQUIRED_RELATION_UNSUPPORTED', path, 'Fragment must follow authored line boundaries', nodeId);
        if (source.props.toc && (start !== 0 || end !== block.text.length))
            fail('DOCX_REQUIRED_RELATION_UNSUPPORTED', path, 'Splitting one authored heading would duplicate or truncate native outline/TOC entries', nodeId);
        const style = required(intent.styles[block.styleId], 'styles'), run = nativeRunStyle(style, block.language), children: ParagraphChild[] = [];
        function runs(a: number, b: number) { const out: TextRun[] = []; for (const segment of block!.segments) {
            const left = Math.max(a, segment.start), right = Math.min(b, segment.end);
            if (left >= right)
                continue;
            const pieces = block!.text.slice(left, right).split('\n');
            pieces.forEach((piece, index) => { if (index)
                out.push(new ScriptRun({ ...run, break: 1 }, segment.script === 'Thai')); if (piece)
                out.push(new ScriptRun({ ...run, text: piece }, segment.script === 'Thai')); });
        } return out; }
        const nav = options.navigation, fields = block.spans.some(s => s.type === 'system-page-field');
        if (fields && nav && (!nav.inBand || source.props.pageFieldLayout !== 'compact'))
            fail('DOCX_CAPABILITY_UNSUPPORTED', path, 'Native page fields require a compact band block; fixed-width field slots are unverified', nodeId);
        if (!(fields && nav?.hideNumbers))
            for (const span of block.spans) {
                if (span.type === 'system-page-field') {
                    if (nav && ownsPoint(block.text, start, end, span.range[0]))
                        children.push(pageField(span.field!, run, nav));
                    continue;
                }
                const a = Math.max(start, span.range[0]), b = Math.min(end, span.range[1]);
                if (a >= b)
                    continue;
                const content = runs(a, b);
                if (span.type === 'reference' && nav) {
                    const target = nav.anchors.get(span.target!);
                    if (!target)
                        fail('DOCX_INPUT_INVALID', path, 'Missing native bookmark', nodeId);
                    children.push(new InternalHyperlink({ anchor: bookmarkName('a', span.target!), children: content }));
                }
                else if (span.url && nav)
                    children.push(new ExternalHyperlink({ link: span.url, children: content }));
                else
                    children.push(...content);
            }
        if (source.props.anchorId && nav) {
            const mark = nav.anchors.get(source.props.anchorId)!;
            if (start === 0)
                children.unshift(mark.start as unknown as ParagraphChild);
            if (end === block.text.length)
                children.push(mark.end as unknown as ParagraphChild);
        }
        const fixed = source.props.heightMode === 'fixed', twips = fixed ? toTwips(source.props.height, path + '.props.height') : style.line.twips;
        if (twips < 1)
            fail('DOCX_GEOMETRY_UNREPRESENTABLE', path, 'Native paragraph line budget quantizes to zero', nodeId);
        const paragraph = new Paragraph({ children, run, ...(options.keepNext !== undefined ? { keepNext: options.keepNext } : {}), ...(options.keepLines !== undefined ? { keepLines: options.keepLines } : {}), ...(source.props.toc ? { outlineLevel: source.props.toc.level - 1 } : {}), alignment: source.props.textAlign ?? 'left', spacing: { before: 0, after: options.spaceAfterTwips ?? 0, line: twips, lineRule: fixed ? LineRuleType.EXACT : LineRuleType.AT_LEAST } });
        return { paragraph, receipt: { nodeId, logicalText: block.text.slice(start, end), font: style.font, line: { rule: fixed ? 'exact' : 'atLeast', twips }, visualVerified: false } };
    });
}
