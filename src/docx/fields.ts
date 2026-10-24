import { required } from './types.js';
import { Bookmark, Run, PageNumber, BuilderElement, StringContainer, type IRunStylePropertiesOptions } from 'docx';
import type { ExportIntent } from './types.js';
import { fail } from './types.js';
import { hash } from './resources.js';
export const bookmarkName = (kind: 'a' | 's', id: string) => 'fd_' + kind + '_' + hash(id).slice(0, 24);
export interface NavigationContext {
    anchors: Map<string, Bookmark>;
    sectionName: string;
    leadingExcluded: number;
    hideNumbers: boolean;
    inBand: boolean;
}
export function anchorBookmarks(intent: ExportIntent) { const out = new Map<string, Bookmark>(); for (const node of Object.values(intent.document.nodes) as any[])
    if (node.type === 'text-block' && node.props.anchorId)
        out.set(node.props.anchorId, new Bookmark({ id: bookmarkName('a', node.props.anchorId), children: [] })); return out; }
const mark = (kind: string) => new BuilderElement({ name: 'w:fldChar', attributes: { type: { key: 'w:fldCharType', value: kind }, ...(kind === 'begin' ? { dirty: { key: 'w:dirty', value: true } } : {}) } });
export function pageField(field: string, run: IRunStylePropertiesOptions, ctx: NavigationContext,positionHalfPoints?:number): Run {
    // The packer expands PAGE/NUMPAGES into following runs by cloning options;
    // constructor options must carry the position to every instruction/result.
    const positioned:IRunStylePropertiesOptions=positionHalfPoints===undefined?run:{...run,position:`${positionHalfPoints/2}pt`};
    if (field === 'current')
        return new Run({ ...positioned, children: [PageNumber.CURRENT] });
    if (!ctx.leadingExcluded)
        return new Run({ ...positioned, children: [PageNumber.TOTAL_PAGES] });
    return new Run({ ...positioned, children: [mark('begin'), new StringContainer('w:instrText', '= '), PageNumber.TOTAL_PAGES, new StringContainer('w:instrText', ' - ' + ctx.leadingExcluded + ' '), mark('separate'), mark('end')] });
}
export function sourceGraph(intent: ExportIntent, scope = 'nodes'): any { if (scope === 'nodes')
    return intent.document.nodes; if (!/^(?:sections\.\d+\.(?:header|footer)|header|footer)\.nodes$/.test(scope))
    fail('DOCX_INPUT_INVALID', scope, 'Unknown graph scope'); let graph: any = intent.document; for (const key of scope.split('.'))
    graph = graph?.[key]; if (!graph)
    fail('DOCX_INPUT_INVALID', scope, 'Missing source graph'); return graph; }
export function fieldDigitBudget(intent: ExportIntent): number { const nodes = Object.values(intent.document.nodes) as any[], body = intent.textBlocks.filter(t => t.scope === 'nodes'), headings = body.filter(t => (intent.document.nodes[t.nodeId] as any).props?.toc), tocCount = nodes.filter(n => n.type === 'table-of-contents').length; const units = 2 * (nodes.length + body.reduce((s, t) => s + t.text.length, 0) + tocCount * headings.reduce((s, t) => s + t.text.length + 32, 0) + (intent.document.sections?.length ?? 0) + 2); const restart = (intent.document.sections as any[]).reduce((m, s) => Math.max(m, s.numbering?.startAt ?? 1), 1); return (BigInt(restart) + BigInt(units)).toString().length; }
