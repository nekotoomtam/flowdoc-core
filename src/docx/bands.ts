import { required } from './types.js';
import { Paragraph, Table, TableRow, TableCell, WidthType, TableLayoutType, BorderStyle, LineRuleType, type FileChild } from 'docx';
import { fail, type ExportIntent } from './types.js';
import { toPoints, toTwips, columnGrid } from './units.js';
import { buildTextParagraph } from './text.js';
import { buildImageParagraph } from './images.js';
import { textEnvelope } from './font-envelope.js';
import { structuralParagraph } from './tables.js';
import type { NavigationContext } from './fields.js';
const take = (r: any) => { if (!r.ok)
    fail(r.issues[0].code, r.issues[0].path, r.issues[0].message); return r.value; };
const noBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' }, borders = { top: noBorder, left: noBorder, bottom: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder };
export function nativeRule(node: any, width: number) { const p = node.props, w = p.width ? toPoints(p.width) : width, sourceThickness = p.thickness ? toPoints(p.thickness) : 0.5, t=Math.round(sourceThickness*8)/8, before = p.spaceBefore ? toTwips(p.spaceBefore) : 0, after = p.spaceAfter ? toTwips(p.spaceAfter) : 0; if (w <= 0 || w > width || sourceThickness <= 0 || t < .25 || t > 12)
    fail('DOCX_GEOMETRY_UNREPRESENTABLE', 'nodes.' + node.id, 'Rule geometry cannot be represented'); const dx = p.align === 'right' ? width - w : p.align === 'center' ? (width - w) / 2 : 0; return { paragraph: new Paragraph({ run: { size: 2, sizeComplexScript: 2, bold: false, italics: false }, indent: { left: Math.round(dx * 20), right: Math.round((width - w - dx) * 20) }, spacing: { before, after, line: 20, lineRule: LineRuleType.EXACT }, border: { bottom: { style: BorderStyle.SINGLE, size: t * 8, color: p.color ?? '000000', space: 0 } } }), heightPt: 1 + t + (before + after) / 20,quantization:{nodeId:node.id,sourceThicknessPt:sourceThickness,nativeThicknessPt:t,deltaPt:t-sourceThickness} }; }
export function buildBand(intent: ExportIntent, band: any, scope: string, page: any, ctx: NavigationContext, options: {
    mapHeaderGap?: boolean;
} = {}) {
    if (band.sizing?.mode === 'content' && (band.sizing.minHeight !== undefined || band.sizing.maxHeight !== undefined))
        fail('DOCX_CAPABILITY_UNSUPPORTED', scope + '.sizing', 'Min/max band fit awaits Word acceptance');
    const physicalWidth = (page.orientation === 'portrait' ? 210 : 297) * 72 / 25.4, left = band.placement ? toPoints(band.placement.left) : toPoints(page.margin.left), right = band.placement ? toPoints(band.placement.right) : toPoints(page.margin.right), width = physicalWidth - left - right;
    let imageReferences = 0;
    const quantization: any[] = [];
    function stack(ids: string[], available: number, afterTwips = 0): {
        children: (Paragraph | Table)[];
        height: number;
        overhead: number;
    } {
        const children: (Paragraph | Table)[] = [];
        let height = 0, overhead = 0;
        for (const id of ids) {
            const n = band.nodes[id];
            if (n.type === 'text-block') {
                if (n.props.heightMode === 'fixed' && n.children.length)
                    fail('DOCX_CAPABILITY_UNSUPPORTED', scope + '.' + id, 'Fixed band text frame unverified');
                const h = n.props.heightMode === 'fixed' ? toPoints(n.props.height) : textEnvelope(intent, id, scope, available);
                height += h;
                children.push(take(buildTextParagraph(intent, id, { scope, navigation: { ...ctx, inBand: true }, spaceAfterTwips: id === ids.at(-1) ? afterTwips : 0 })).paragraph);
            }
            else if (n.type === 'image') {
                if (toPoints(n.props.width) > available)
                    fail('DOCX_GEOMETRY_UNREPRESENTABLE', scope + '.' + id, 'Band image exceeds column');
                height += toPoints(n.props.height) + 1;
                overhead += 1;
                imageReferences++;
                children.push(take(buildImageParagraph(intent, id, scope)).paragraph);
            }
            else if (n.type === 'line') {
                const r = nativeRule(n, available);
                quantization.push({kind:'rule-thickness-quantization',scope,...r.quantization});
                height += r.heightPt;
                children.push(r.paragraph);
            }
            else if (n.type === 'columns') {
                const gap = n.props.gap ? toPoints(n.props.gap) : 0, total = n.columns.reduce((s: number, c: any) => s + c.weight, 0), usable = available - gap * (n.columns.length - 1);
                if (usable <= 0)
                    fail('DOCX_GEOMETRY_UNREPRESENTABLE', scope + '.' + id, 'No usable band column width');
                const lengths: any[] = [], parts: {
                    children: (Paragraph | Table)[];
                    height: number;
                    overhead: number;
                }[] = [];
                for (const [i, c] of n.columns.entries()) {
                    const cw = usable * c.weight / total;
                    lengths.push({ unit: 'pt', value: cw });
                    parts.push(stack(c.childIds, cw));
                    if (i < n.columns.length - 1 && gap > 0) {
                        lengths.push({ unit: 'pt', value: gap });
                        parts.push({ children: [], height: 1, overhead: 1 });
                    }
                }
                const grid = columnGrid(lengths);
                grid.forEach((twips, i) => { const sourcePt = lengths[i].value; if (twips / 20 !== sourcePt)
                    quantization.push({ kind: 'band-grid-quantization', path: scope + '.' + id + '.derivedColumns.' + i, sourcePt, twips, errorPt: twips / 20 - sourcePt }); });
                const cells = parts.map((p, i) => new TableCell({ children: p.children.length ? p.children : [structuralParagraph()], width: { type: WidthType.DXA, size: required(grid[i], 'band.column.width') }, margins: { top: 0, right: 0, bottom: 0, left: 0 } }));
                children.push(new Table({ rows: [new TableRow({ children: cells, cantSplit: true })], columnWidths: grid, width: { type: WidthType.DXA, size: grid.reduce((a, b) => a + b, 0) }, layout: TableLayoutType.FIXED, borders }));
                height += Math.max(...parts.map(p => p.height), 1);
                overhead += parts.reduce((a,b)=>a.height>=b.height?a:b).overhead;
            }
            else
                fail('DOCX_CAPABILITY_UNSUPPORTED', scope + '.' + id, 'Unsupported band node');
        }
        if (children.at(-1) instanceof Table) {
            children.push(structuralParagraph(afterTwips));
            height += 1;
            overhead += 1;
        }
        return { children, height, overhead };
    }
    const built = stack(band.rootIds, width, options.mapHeaderGap && band.gap ? toTwips(band.gap) : 0);
    if (left !== toPoints(page.margin.left) || right !== toPoints(page.margin.right)) {
        const grid = columnGrid([{ unit: 'pt', value: width }]);
        const wrapper = new Table({ rows: [new TableRow({ children: [new TableCell({ children: built.children.length ? built.children : [structuralParagraph()], margins: { top: 0, right: 0, bottom: 0, left: 0 }, width: { type: WidthType.DXA, size: required(grid[0], 'band.wrapper.width') } })], cantSplit: true })], columnWidths: grid, width: { type: WidthType.DXA, size: required(grid[0], 'band.wrapper.width') }, indent: { type: WidthType.DXA, size: Math.round((left - toPoints(page.margin.left)) * 20) }, layout: TableLayoutType.FIXED, borders });
        built.children = [wrapper, structuralParagraph()];
        built.height += 1;
        built.overhead += 1;
    }
    if (band.sizing?.mode === 'fixed') {
        const sourceHeightPt = toPoints(band.sizing.height), structuralOverheadPt = built.overhead, contentBoundPt = built.height - structuralOverheadPt;
        if (contentBoundPt > sourceHeightPt + 1e-6)
            fail('DOCX_CAPABILITY_UNSUPPORTED', scope + '.sizing', 'Band content exceeds the fixed source height');
        // Retain every native paragraph and image; never force an Exact row
        // that clips content. Account for Word's required structural paragraphs.
        const slackTwips = Math.max(0, Math.round((sourceHeightPt - contentBoundPt) * 20));
        if (slackTwips) built.children.push(new Paragraph({run:{size:2,sizeComplexScript:2},spacing:{before:0,after:0,line:slackTwips,lineRule:LineRuleType.EXACT}}));
        built.height += slackTwips / 20;
        quantization.push({kind:'fixed-band-native-reservation',scope,sourceHeightPt,contentBoundPt,structuralOverheadPt,nativeReservedHeightPt:built.height,policy:'source-height-plus-native-structural-overhead',wordVerified:false});
    }
    return { children: built.children.length ? built.children : [structuralParagraph()], reservedHeightTwips: Math.max(20, Math.ceil(built.height * 20)), imageReferences, offsetTwips: band.placement ? toTwips(band.placement.offset) : undefined, gapTwips: band.gap ? toTwips(band.gap) : 0, provisional: true, wordFootprintVerified: false, quantization };
}
