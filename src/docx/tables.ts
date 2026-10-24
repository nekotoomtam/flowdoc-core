import { required } from './types.js';
import { toPoints } from './units.js';
import { deriveTableSpace, type TableSpaceDecision } from './geometry-policy.js';
import { Table, TableRow, TableCell, Paragraph, WidthType, TableLayoutType, BorderStyle, VerticalMergeType, LineRuleType, type FileChild } from 'docx';
import { capture, fail, type ExportIntent, type Result } from './types.js';
import { requireGenuineIntent } from './profile.js';
import { deriveReadingPlan, type ReadingPlan } from './groups.js';
import { buildTextParagraph } from './text.js';
import { baselineDecision,tableWidthProven } from './metric-baseline.js';
import {sourceGuide} from './source-layout.js';
import { buildImageParagraph } from './images.js';
import type { NavigationContext } from './fields.js';
export type TableSpaceReceipt = {
    nodeId: string;
    scope: 'nodes';
    cellBorderPolicy: 'explicit-merged-cell-perimeter';
    policy: TableSpaceDecision['policy'];
    reason: string;
    horizontalPolicy: 'border-centre-inset' | 'border-centre-inset-preserve-width' | 'retain-native';
    cells: {
        nodeId: string;
        sourceTopPt: number;
        sourceBottomPt: number;
        sourceTopTwips: number;
        sourceBottomTwips: number;
        nativeTopTwips: number;
        nativeBottomTwips: number;
        sourceLeftTwips: number;
        sourceRightTwips: number;
        nativeLeftTwips: number;
        nativeRightTwips: number;
    }[];
    baselinePolicy: 'native-at-least-unmatched' | 'per-paragraph-metric-or-native';
    baselineMatchVerified: false;
    terminalStrokeCompensationPt: number;
};
const take = <T>(r: Result<T>): T => { if (!r.ok) {
    const e = required(r.issues[0], 'issues');
    fail(e.code, e.path ?? 'nodes', e.message);
} return r.value; };
export function structuralParagraph(afterTwips = 0) { return new Paragraph({ run: { size: 2, sizeComplexScript: 2, bold: false, italics: false }, spacing: { before: 0, after: afterTwips, line: 20, lineRule: LineRuleType.EXACT } }); }
function textParts(intent: ExportIntent, id: string, plan: ReadingPlan, forceKeep = false, navigation?: NavigationContext, protectedFlow = false) { return plan.fragments.filter(f => f.nodeId === id).sort((a, b) => a.start - b.start).map(f => take(buildTextParagraph(intent, id, { ...f, keepNext: forceKeep || f.keepNext, ordinaryBodyOrCell: !protectedFlow && !plan.edges.some(e => e.from === id || e.to === id), ...(navigation ? { navigation } : {}) })).paragraph); }
export function buildTable(intent: ExportIntent, nodeId: string, navigation?: NavigationContext): Result<{
    table: Table;
    receipt: {
        spacePolicy: TableSpaceReceipt;
        nodeId: string;
        logicalCellIds: string[];
        continuationCells: number;
        structuralEmptyParagraphs: number;
        keptRowIds: string[];
        groupEdges: number;
        wordLayoutVerified: false;
    };
}> {
    return capture(() => {
        requireGenuineIntent(intent);
        const nodes: any = intent.document.nodes, n = nodes[nodeId], mapped = intent.tables.find(t => t.nodeId === nodeId && t.scope === 'nodes');
        if (n?.type !== 'table' || !mapped)
            fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + nodeId, 'Expected source body table');
        if (!n.rowIds.length)
            fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + nodeId, 'Native empty table without rows is unsupported');
        const plainTextGrid = mapped.cells.every(cell => { const c = nodes[cell.nodeId]; return c.childIds.every((id: string) => nodes[id].type === 'text-block' && nodes[id].props.heightMode !== 'fixed'); });
        const sourcePoints = mapped.cells.map(cell => { const padding = nodes[cell.nodeId].props.padding; return { sourceTopPt: padding?.top ? toPoints(padding.top) : 4, sourceBottomPt: padding?.bottom ? toPoints(padding.bottom) : 4 }; });
        const decisions = mapped.cells.map((cell, i) => deriveTableSpace({ plainTextGrid, uniformSingleHalfPointBorder: true, ...required(sourcePoints[i], 'table.padding'), sourceTopTwips: cell.paddingTwips.top, sourceBottomTwips: cell.paddingTwips.bottom }));
        const allPadding = decisions.every(d => d.policy === 'border-centre-inset');
        const adapted = plainTextGrid && allPadding;
        const border = { style: BorderStyle.SINGLE, size: 4, color: n.props.borderColor ?? '000000' };
        // Source row flow excludes its painted stroke envelope. In the bounded
        // native Exact/one-line profile Word also reserves the terminal outer
        // stroke. Charge that emitted thickness once, at the physical last row,
        // rather than shifting following paragraphs or changing source geometry.
        // Guided rows own a separate frame budget; vertical merges can share
        // margins across physical rows and remain outside this accommodation.
        const terminalStrokeCompensationPt=adapted&&tableWidthProven(intent,nodeId)&&mapped.cells.every(cell=>{
            const c=nodes[cell.nodeId];return (c.props.rowSpan??1)===1&&c.childIds.length>0&&c.childIds.every((id:string)=>{
                const b=intent.textBlocks.find(t=>t.scope==='nodes'&&t.nodeId===id);
                return b?.text.trim()&& !sourceGuide(intent,id)&&baselineDecision(intent,'nodes',id)?.policy==='font-metric-exact';
            });
        })?border.size/8:0;
        const terminalCells=new Set<string>(nodes[n.rowIds.at(-1)!].cellIds);
        // Same measured half-stroke origin as the vertical mapper. Keep the
        // horizontal accommodation within proven text grids and exact4pt sides.
        const horizontal=adapted&&mapped.cells.every(cell=>{
            const c=nodes[cell.nodeId],padding=c.props.padding;
            return cell.paddingTwips.left===80&&cell.paddingTwips.right===80&&
                (!padding?.left||toPoints(padding.left)===4)&&(!padding?.right||toPoints(padding.right)===4)&&
                c.childIds.every((id:string)=>baselineDecision(intent,'nodes',id)?.policy==='font-metric-exact');
        });
        const preserveWidth=horizontal&&!tableWidthProven(intent,nodeId);
        const metricParagraphs=mapped.cells.some(cell=>nodes[cell.nodeId].childIds.some((id:string)=>baselineDecision(intent,'nodes',id)!==undefined));
        const spacePolicy: TableSpaceReceipt = { nodeId, scope: 'nodes', cellBorderPolicy: 'explicit-merged-cell-perimeter', terminalStrokeCompensationPt, policy: adapted ? 'border-centre-inset' : 'retain-native', horizontalPolicy: horizontal?(preserveWidth?'border-centre-inset-preserve-width':'border-centre-inset'):'retain-native', reason: !plainTextGrid ? 'unverified-grid-or-content' : !allPadding ? 'unverified-vertical-padding' : 'bounded-half-stroke-inset', cells: mapped.cells.map((cell, i) => ({ nodeId: cell.nodeId, ...required(sourcePoints[i], 'table.padding'), sourceTopTwips: cell.paddingTwips.top, sourceBottomTwips: cell.paddingTwips.bottom, nativeTopTwips: adapted ? required(decisions[i], 'table.decision').nativeTopTwips : cell.paddingTwips.top, nativeBottomTwips: (adapted ? required(decisions[i], 'table.decision').nativeBottomTwips : cell.paddingTwips.bottom)-(terminalCells.has(cell.nodeId)?Math.round(terminalStrokeCompensationPt*20):0),
            sourceLeftTwips:cell.paddingTwips.left,sourceRightTwips:cell.paddingTwips.right,
            nativeLeftTwips:cell.paddingTwips.left-(horizontal?5:0),nativeRightTwips:cell.paddingTwips.right+(horizontal?(preserveWidth?5:-5):0) })), baselinePolicy: metricParagraphs?'per-paragraph-metric-or-native':'native-at-least-unmatched', baselineMatchVerified: false };
        const plan = take(deriveReadingPlan(intent));
        const grid = mapped.columnTwips, rows: TableRow[] = [], logicalCellIds: string[] = [], occupancy = new Map<string, {
            id: string;
            row: number;
            col: number;
            span: number;
            rowSpan: number;
        }>();
        let continuationCells = 0, structuralEmptyParagraphs = 0;
        n.rowIds.forEach((rid: string, row: number) => nodes[rid].cellIds.forEach((cid: string, index: number) => { const p = nodes[cid].props, col = p.columnIndex ?? index, span = p.colSpan ?? 1, rs = p.rowSpan ?? 1; logicalCellIds.push(cid); for (let y = row; y < row + rs; y++)
            for (let x = col; x < col + span; x++)
                occupancy.set(y + ':' + x, { id: cid, row, col, span, rowSpan: rs }); }));
        for (const [row, rid] of n.rowIds.entries()) {
            const cells: TableCell[] = [];
            for (let col = 0; col < grid.length;) {
                const pos = occupancy.get(row + ':' + col)!;
                if (!pos || pos.col !== col)
                    fail('DOCX_INPUT_INVALID', 'nodes.' + nodeId, 'Invalid verified cell placement');
                const c = nodes[pos.id], pad = mapped.cells.find(cell => cell.nodeId === pos.id)!.paddingTwips, continuation = pos.row !== row, children: Paragraph[] = [];
                if (!continuation)
                    for (const child of c.childIds) {
                        if (nodes[child].type === 'text-block')
                            children.push(...textParts(intent, child, plan, plan.keptRows[nodeId]?.includes(rid), navigation, row < n.props.headerRowCount || !nodes[rid].props.allowBreak || (n.rowGroups ?? []).some((g: any) => g.keepStart && g.prefixRowIds.length > 0 && g.rowIds.includes(rid)) || (c.props.rowSpan ?? 1) > 1 || (c.props.colSpan ?? 1) > 1 || plan.edges.some(e => e.from === nodeId || e.to === nodeId)));
                        else if (nodes[child].type === 'image')
                            children.push(take(buildImageParagraph(intent, child)).paragraph);
                        else
                            fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + child, 'Unsupported cell content');
                    }
                else
                    continuationCells++;
                if (!children.length) {
                    children.push(structuralParagraph());
                    structuralEmptyParagraphs++;
                }
                const fill = c.props.fillColor ?? (pos.row < n.props.headerRowCount ? n.props.headerFillColor : undefined);
                // Make the perimeter explicit on each physical cell. A native
                // vertical merge has no horizontal edge between its members.
                const noBorder = { style: BorderStyle.NONE, size: 0, color: border.color };
                const cellBorders = { top: continuation ? noBorder : border, bottom: row < pos.row + pos.rowSpan - 1 ? noBorder : border, left: border, right: border };
                cells.push(new TableCell({ children, borders: cellBorders, width: { type: WidthType.DXA, size: grid.slice(col, col + pos.span).reduce((a, b) => a + b, 0) }, ...(pos.span > 1 ? { columnSpan: pos.span } : {}), ...(pos.rowSpan > 1 ? { verticalMerge: continuation ? VerticalMergeType.CONTINUE : VerticalMergeType.RESTART } : {}), margins: { top: spacePolicy.cells.find(c => c.nodeId === pos.id)!.nativeTopTwips, right: spacePolicy.cells.find(c=>c.nodeId===pos.id)!.nativeRightTwips, bottom: spacePolicy.cells.find(c => c.nodeId === pos.id)!.nativeBottomTwips, left: spacePolicy.cells.find(c=>c.nodeId===pos.id)!.nativeLeftTwips }, ...(fill ? { shading: { fill } } : {}) }));
                col += pos.span;
            }
            rows.push(new TableRow({ children: cells, tableHeader: n.props.repeatHeaderRows && row < n.props.headerRowCount, cantSplit: !nodes[rid].props.allowBreak, keepNext: plan.keptRows[nodeId]?.includes(rid) ?? false }));
        }
        const table = new Table({ rows, columnWidths: [...grid], width: { type: WidthType.DXA, size: grid.reduce((a, b) => a + b, 0) }, layout: TableLayoutType.FIXED, indent: { type: WidthType.DXA, size: 0 }, borders: { top: border, right: border, bottom: border, left: border, insideHorizontal: border, insideVertical: border } });
        return { table, receipt: { spacePolicy, nodeId, logicalCellIds, continuationCells, structuralEmptyParagraphs, keptRowIds: plan.keptRows[nodeId] ?? [], groupEdges: plan.edges.length, wordLayoutVerified: false } };
    });
}
export function buildBodyFlow(intent: ExportIntent, options: {
    sectionId?: string;
    navigation?: NavigationContext;
    omittedRootIds?: ReadonlySet<string>;
    special?: (id: string) => FileChild[];
} = {}): Result<{
    children: FileChild[];
    receipt: {
        tableSpaces: TableSpaceReceipt[];
        tableSeparators: number;
        wordLayoutVerified: false;
        readingPlan: ReadingPlan;
    };
}> {
    return capture(() => {
        requireGenuineIntent(intent);
        if (intent.document.sections!.length !== 1 && !options.sectionId)
            fail('DOCX_CAPABILITY_UNSUPPORTED', 'sections', 'Multiple section serialization requires U4');
        const plan = take(deriveReadingPlan(intent)), nodes: any = intent.document.nodes, children: FileChild[] = [], tableSpaces: TableSpaceReceipt[] = [];
        let previous = '', tableSeparators = 0;
        for (const section of (intent.document.sections as any[]).filter(s => !options.sectionId || s.sectionId === options.sectionId)) {
            previous = '';
            let hasRoot = false, pendingBreak: string | undefined;
            for (const id of section.rootIds) {
                if (options.omittedRootIds?.has(id)) continue;
                const n = nodes[id];
                if (n.type === 'page-break') {
                    if (!options.special)
                        fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + id, 'Body-flow harness supports U2/U3 nodes only; U4 pending');
                    if (hasRoot)
                        pendingBreak ??= id;
                    continue;
                }
                // Coalesce source requests only: all non-break roots retain their
                // footprint, including empty text, fixed spacers and native TOC.
                // A pending request at the Section end has no following root.
                if (pendingBreak !== undefined) {
                    children.push(...options.special!(pendingBreak));
                    previous = 'page-break';
                    pendingBreak = undefined;
                }
                if (n.type === 'table') {
                    if (previous === 'table') {
                        children.push(structuralParagraph());
                        tableSeparators++;
                    }
                    const built = take(buildTable(intent, id, options.navigation));
                    children.push(built.table);
                    tableSpaces.push(built.receipt.spacePolicy);
                }
                else if (n.type === 'text-block')
                    children.push(...textParts(intent, id, plan, false, options.navigation));
                else if (n.type === 'image')
                    children.push(take(buildImageParagraph(intent, id)).paragraph);
                else if (options.special)
                    children.push(...options.special(id));
                else
                    fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + id, 'Body-flow harness supports U2/U3 nodes only; U4 pending');
                previous = n.type;
                hasRoot = true;
            }
        }
        return { children, receipt: { tableSpaces, tableSeparators, wordLayoutVerified: false, readingPlan: plan } };
    });
}
