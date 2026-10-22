import { required } from './types.js';
import { toPoints } from './units.js';
import { deriveTableSpace, type TableSpaceDecision } from './geometry-policy.js';
import { Table, TableRow, TableCell, Paragraph, WidthType, TableLayoutType, BorderStyle, VerticalMergeType, LineRuleType, type FileChild } from 'docx';
import { capture, fail, type ExportIntent, type Result } from './types.js';
import { requireGenuineIntent } from './profile.js';
import { deriveReadingPlan, type ReadingPlan } from './groups.js';
import { buildTextParagraph } from './text.js';
import { buildImageParagraph } from './images.js';
import type { NavigationContext } from './fields.js';
export type TableSpaceReceipt = {
    nodeId: string;
    scope: 'nodes';
    policy: TableSpaceDecision['policy'];
    reason: string;
    cells: {
        nodeId: string;
        sourceTopPt: number;
        sourceBottomPt: number;
        sourceTopTwips: number;
        sourceBottomTwips: number;
        nativeTopTwips: number;
        nativeBottomTwips: number;
    }[];
    baselinePolicy: 'native-at-least-unmatched';
    baselineMatchVerified: false;
};
const take = <T>(r: Result<T>): T => { if (!r.ok) {
    const e = required(r.issues[0], 'issues');
    fail(e.code, e.path ?? 'nodes', e.message);
} return r.value; };
export function structuralParagraph(afterTwips = 0) { return new Paragraph({ run: { size: 2, sizeComplexScript: 2, bold: false, italics: false }, spacing: { before: 0, after: afterTwips, line: 20, lineRule: LineRuleType.EXACT } }); }
function textParts(intent: ExportIntent, id: string, plan: ReadingPlan, forceKeep = false, navigation?: NavigationContext) { return plan.fragments.filter(f => f.nodeId === id).sort((a, b) => a.start - b.start).map(f => take(buildTextParagraph(intent, id, { ...f, keepNext: forceKeep || f.keepNext, ...(navigation ? { navigation } : {}) })).paragraph); }
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
        const unmergedPlainGrid = mapped.cells.every(cell => { const c = nodes[cell.nodeId]; return (c.props.colSpan ?? 1) === 1 && (c.props.rowSpan ?? 1) === 1 && c.childIds.every((id: string) => nodes[id].type === 'text-block' && nodes[id].props.heightMode === 'content'); });
        const sourcePoints = mapped.cells.map(cell => { const padding = nodes[cell.nodeId].props.padding; return { sourceTopPt: padding?.top ? toPoints(padding.top) : 4, sourceBottomPt: padding?.bottom ? toPoints(padding.bottom) : 4 }; });
        const decisions = mapped.cells.map((cell, i) => deriveTableSpace({ unmergedPlainGrid, uniformSingleHalfPointBorder: true, ...required(sourcePoints[i], 'table.padding'), sourceTopTwips: cell.paddingTwips.top, sourceBottomTwips: cell.paddingTwips.bottom }));
        const allPadding = decisions.every(d => d.policy === 'border-centre-inset');
        const adapted = unmergedPlainGrid && allPadding;
        const spacePolicy: TableSpaceReceipt = { nodeId, scope: 'nodes', policy: adapted ? 'border-centre-inset' : 'retain-native', reason: !unmergedPlainGrid ? 'unverified-grid-or-content' : !allPadding ? 'unverified-vertical-padding' : 'bounded-half-stroke-inset', cells: mapped.cells.map((cell, i) => ({ nodeId: cell.nodeId, ...required(sourcePoints[i], 'table.padding'), sourceTopTwips: cell.paddingTwips.top, sourceBottomTwips: cell.paddingTwips.bottom, nativeTopTwips: adapted ? required(decisions[i], 'table.decision').nativeTopTwips : cell.paddingTwips.top, nativeBottomTwips: adapted ? required(decisions[i], 'table.decision').nativeBottomTwips : cell.paddingTwips.bottom })), baselinePolicy: 'native-at-least-unmatched', baselineMatchVerified: false };
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
                            children.push(...textParts(intent, child, plan, plan.keptRows[nodeId]?.includes(rid), navigation));
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
                cells.push(new TableCell({ children, width: { type: WidthType.DXA, size: grid.slice(col, col + pos.span).reduce((a, b) => a + b, 0) }, ...(pos.span > 1 ? { columnSpan: pos.span } : {}), ...(pos.rowSpan > 1 ? { verticalMerge: continuation ? VerticalMergeType.CONTINUE : VerticalMergeType.RESTART } : {}), margins: { top: spacePolicy.cells.find(c => c.nodeId === pos.id)!.nativeTopTwips, right: pad.right, bottom: spacePolicy.cells.find(c => c.nodeId === pos.id)!.nativeBottomTwips, left: pad.left }, ...(fill ? { shading: { fill } } : {}) }));
                col += pos.span;
            }
            rows.push(new TableRow({ children: cells, tableHeader: n.props.repeatHeaderRows && row < n.props.headerRowCount, cantSplit: !nodes[rid].props.allowBreak, keepNext: plan.keptRows[nodeId]?.includes(rid) ?? false }));
        }
        const border = { style: BorderStyle.SINGLE, size: 4, color: n.props.borderColor ?? '000000' }, table = new Table({ rows, columnWidths: [...grid], width: { type: WidthType.DXA, size: grid.reduce((a, b) => a + b, 0) }, layout: TableLayoutType.FIXED, indent: { type: WidthType.DXA, size: 0 }, borders: { top: border, right: border, bottom: border, left: border, insideHorizontal: border, insideVertical: border } });
        return { table, receipt: { spacePolicy, nodeId, logicalCellIds, continuationCells, structuralEmptyParagraphs, keptRowIds: plan.keptRows[nodeId] ?? [], groupEdges: plan.edges.length, wordLayoutVerified: false } };
    });
}
export function buildBodyFlow(intent: ExportIntent, options: {
    sectionId?: string;
    navigation?: NavigationContext;
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
            for (const id of section.rootIds) {
                const n = nodes[id];
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
            }
        }
        return { children, receipt: { tableSpaces, tableSeparators, wordLayoutVerified: false, readingPlan: plan } };
    });
}
