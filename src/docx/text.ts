import { required } from './types.js';
import { Paragraph, TextRun, OnOffElement, XmlComponent,XmlAttributeComponent,LineRuleType, ExternalHyperlink, InternalHyperlink, type ParagraphChild, type IRunOptions, type IRunStylePropertiesOptions } from 'docx';
import type { ExportIntent, EffectiveStyle, Result } from './types.js';
import { capture, fail } from './types.js';
import { requireGenuineIntent } from './profile.js';
import { toTwips } from './units.js';
import { sourceGraph, pageField, bookmarkName, type NavigationContext } from './fields.js';
import { ownsPoint } from './text-intent.js';
import { baselineDecision,pairSpacingAt,thaiWordBoundaries } from './metric-baseline.js';
import {sourceParagraph} from './source-layout-xml.js';
// Undefined CS emphasis lets docx copy ordinary true AND false, overriding inheritance.
export function nativeRunStyle(style: EffectiveStyle, language?: string): IRunStylePropertiesOptions {
    return { font: { ascii: style.font.family, hAnsi: style.font.family, cs: style.font.family, eastAsia: style.font.family }, size: style.sizeHalfPoints, sizeComplexScript: style.sizeHalfPoints, bold: style.bold, italics: style.italic, snapToGrid: false, ...(language ? { language: { value: language, bidirectional: language } } : {}) };
}
class PositionAttributes extends XmlAttributeComponent<{val:number}>{protected readonly xmlKeys={val:'w:val'};}
class NativePosition extends XmlComponent{constructor(val:number){super('w:position');this.root.push(new PositionAttributes({val}));}}
class NativeZeroSpacing extends XmlComponent{constructor(){super('w:spacing');this.root.push(new PositionAttributes({val:0}));}}
class ScriptRun extends TextRun {
    constructor(options: IRunOptions, thai: boolean,position?:number) { super(options); if (thai)
        this.properties.push(new OnOffElement('w:cs', true));
        // docx drops characterSpacing:0 through a truthiness check. The explicit
        // native zero is required here to retain the alternating boundaries.
        if(options.characterSpacing===0)this.properties.push(new NativeZeroSpacing());
        if(position!==undefined)this.properties.push(new NativePosition(position)); }
}
export function buildTextParagraph(intent: ExportIntent, nodeId: string, options: {
    start?: number;
    end?: number;
    keepNext?: boolean;
    keepLines?: boolean;
    spaceAfterTwips?: number;
    ordinaryBodyOrCell?: boolean;
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
        const baseline=baselineDecision(intent,scope,nodeId),exact=baseline?.policy==='font-metric-exact';
        const thaiEnds=thaiWordBoundaries(intent,scope,nodeId);
        function runs(a: number, b: number) { const out: TextRun[] = []; for (const segment of block!.segments) {
            const left = Math.max(a, segment.start), right = Math.min(b, segment.end);
            if (left >= right)
                continue;
            const pieces = block!.text.slice(left, right).split('\n');let offset=left;
            pieces.forEach((piece, index) => { if (index){offset++;
                out.push(new ScriptRun({ ...run, break: 1 }, segment.script === 'Thai',exact?baseline.positionHalfPoints:undefined));}
                if(segment.script==='Thai'&&thaiEnds){
                    let at=offset;
                    for(const [index,end]of thaiEnds.entries()){
                        if(end<=at)continue;
                        if(end>offset+piece.length)break;
                        out.push(new ScriptRun({...run,text:block!.text.slice(at,end),...(index%2?{characterSpacing:0}:{})},true));at=end;
                    }
                    if(at!==offset+piece.length)throw Error('Unbound Thai word boundary');
                    offset+=piece.length;return;
                }
                let start=0;
                const emit=(text:string,spacing?:number)=>{if(text)out.push(new ScriptRun({...run,text,...(spacing===undefined?{}:{characterSpacing:spacing})},segment.script==='Thai',exact?baseline.positionHalfPoints:undefined));};
                for(let i=0;i<piece.length;i++){
                    const spacing=segment.script==='Latin'?pairSpacingAt(intent,scope,nodeId,offset+i):undefined;
                    if(spacing===undefined)continue;
                    emit(piece.slice(start,i));emit(piece[i]!,spacing);start=i+1;
                }
                emit(piece.slice(start));offset+=piece.length;
            });
        } return out; }
        const nav = options.navigation, fields = block.spans.some(s => s.type === 'system-page-field');
        if (fields && nav && (!nav.inBand || source.props.pageFieldLayout !== 'compact'))
            fail('DOCX_CAPABILITY_UNSUPPORTED', path, 'Native page fields require a compact band block; fixed-width field slots are unverified', nodeId);
        if (!(fields && nav?.hideNumbers))
            for (const span of block.spans) {
                if (span.type === 'system-page-field') {
                    if (nav && ownsPoint(block.text, start, end, span.range[0]))
                        children.push(pageField(span.field!, run, nav,exact?baseline.positionHalfPoints:undefined));
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
        const ordinary = options.ordinaryBodyOrCell === true && scope === 'nodes' && !fixed && !fields && !source.props.toc && start === 0 && end === block.text.length && !options.keepNext && !options.keepLines;
        const paragraph = sourceParagraph(intent,nodeId,ordinary,{ children, run, ...(ordinary ? { widowControl: false } : {}), ...(options.keepNext !== undefined ? { keepNext: options.keepNext } : {}), ...(options.keepLines !== undefined ? { keepLines: options.keepLines } : {}), ...(source.props.toc ? { outlineLevel: source.props.toc.level - 1 } : {}), alignment: source.props.textAlign ?? 'left', spacing: { before: 0, after: options.spaceAfterTwips ?? 0, line: twips, lineRule: fixed||exact ? LineRuleType.EXACT : LineRuleType.AT_LEAST } });
        return { paragraph, receipt: { nodeId, logicalText: block.text.slice(start, end), font: style.font, line: { rule: fixed||exact ? 'exact' : 'atLeast', twips }, visualVerified: false } };
    });
}
