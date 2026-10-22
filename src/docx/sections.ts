import { required } from './types.js';
import { deriveHeaderSpace } from './geometry-policy.js';
import { headerSpaceEligibility } from './header-space.js';
import { Header, Footer, Paragraph, PageBreak, TableOfContents, Bookmark, SectionType, PageOrientation, type ISectionOptions, type FileChild } from 'docx';
import { fail, type ExportIntent } from './types.js';
import { toPoints, toTwips } from './units.js';
import { buildBodyFlow, structuralParagraph } from './tables.js';
import { anchorBookmarks, bookmarkName, type NavigationContext } from './fields.js';
import { buildBand, nativeRule } from './bands.js';
import { textEnvelope, concreteFontBounds } from './font-envelope.js';
const take = (r: any) => { if (!r.ok)
    fail(r.issues[0].code, r.issues[0].path, r.issues[0].message); return r.value; };
export function buildSections(intent: ExportIntent) {
    const sections: ISectionOptions[] = [], receipts: any[] = [], anchors = anchorBookmarks(intent), nodes: any = intent.document.nodes, sourceSections = intent.document.sections as any[];
    let included = false, leadingExcluded = 0;
    for (const [i, s] of sourceSections.entries()) {
        const mode = s.numbering?.mode ?? (s.role === 'cover' ? 'exclude' : 'continue');
        if (mode === 'exclude') {
            if (included || s.role !== 'cover' && s.sourceKind !== 'blank')
                fail('DOCX_CAPABILITY_UNSUPPORTED', 'sections.' + i + '.numbering', 'Only leading one-page cover/blank exclusions are mapped');
            leadingExcluded++;
        }
        else
            included = true;
    }
    let firstIncluded = true, imageReferences = 0;
    const hasScopedToc = sourceSections.some(s => s.rootIds.some((id: string) => nodes[id].type === 'table-of-contents' && nodes[id].props.scope?.kind === 'section'));
    for (const [index, s] of sourceSections.entries()) {
        const numbering = s.numbering ?? { mode: s.role === 'cover' ? 'exclude' : 'continue' }, mode = numbering.mode, hideNumbers = s.role === 'cover' || s.sourceKind === 'blank' || numbering.visibility === 'hide' || mode === 'exclude', page = s.page, pw = (page.orientation === 'portrait' ? 210 : 297) * 72 / 25.4, ph = (page.orientation === 'portrait' ? 297 : 210) * 72 / 25.4, sourceMargin = { top: toTwips(page.margin.top), right: toTwips(page.margin.right), bottom: toTwips(page.margin.bottom), left: toTwips(page.margin.left) }, margin: any = { ...sourceMargin, header: sourceMargin.top, footer: sourceMargin.bottom }, ctx: NavigationContext = { anchors, sectionName: bookmarkName('s', s.sectionId), leadingExcluded, hideNumbers, inBand: false };
        if (s.role === 'cover') {
            let used = 0;
            for (const id of s.rootIds) {
                const n = nodes[id];
                if (n.type === 'text-block')
                    used += n.props.heightMode === 'fixed' ? toPoints(n.props.height) : textEnvelope(intent, id, 'nodes', pw - toPoints(page.margin.left) - toPoints(page.margin.right));
                else if (n.type === 'image')
                    used += toPoints(n.props.height) + 1;
                else
                    fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + id, 'Cover one-page envelope supports text/images only');
            }
            if (used > (ph - toPoints(page.margin.top) - toPoints(page.margin.bottom)) * .8)
                fail('DOCX_CAPABILITY_UNSUPPORTED', 'sections.' + index, 'Cover exceeds provisional one-page envelope');
        }
        const bandReceipt: any = {}, groups: any = {}, estimated: any = { ...sourceMargin };
        let dynamicHeader = false;
        for (const kind of ['header', 'footer'] as const) {
            const b = s[kind] ?? (intent.document as any)[kind], requested = s[kind + 'Mode'], effective = s.role === 'body' && s.sourceKind !== 'blank' ? requested : 'none';
            const makeEmpty = () => kind === 'header' ? new Header({ children: [structuralParagraph()] }) : new Footer({ children: [structuralParagraph()] });
            let real: any, prepared: any;
            if (b && effective !== 'none') {
                const scope = s[kind] ? 'sections.' + index + '.' + kind + '.nodes' : kind + '.nodes';
                const eligibility = kind === 'header' ? headerSpaceEligibility(b) : { eligible: false };
                const mapHeaderGap = kind === 'header' && eligibility.eligible;
                if (kind === 'header')
                    dynamicHeader = mapHeaderGap;
                prepared = buildBand(intent, b, scope, page, ctx, { mapHeaderGap });
                prepared.spacePolicy = mapHeaderGap ? 'native-visible-header' : 'maximum-reservation';
                prepared.shape = eligibility.shape;
                prepared.fallbackReason = kind === 'header' && !mapHeaderGap ? eligibility.reason : undefined;
                const offset = prepared.offsetTwips ?? sourceMargin[kind === 'header' ? 'top' : 'bottom'];
                margin[kind] = offset;
                const edge = kind === 'header' ? 'top' : 'bottom';
                estimated[edge] = Math.max(sourceMargin[edge], offset + prepared.reservedHeightTwips + prepared.gapTwips);
                if (kind !== 'header' || !dynamicHeader)
                    margin[edge] = estimated[edge];
                let used = false;
                real = () => { const content = used ? buildBand(intent, b, scope, page, ctx, { mapHeaderGap }) : prepared; used = true; return kind === 'header' ? new Header({ children: content.children }) : new Footer({ children: content.children }); };
                imageReferences += prepared.imageReferences * (effective === 'all' ? 2 : 1);
            }
            groups[kind] = { default: b && ['all', 'continuation'].includes(effective) ? real() : makeEmpty(), first: b && ['all', 'first'].includes(effective) ? real() : makeEmpty() };
            bandReceipt[kind] = { mode: effective, sourceMode: requested, reservedHeightTwips: prepared?.reservedHeightTwips ?? 0, offsetTwips: prepared?.offsetTwips ?? sourceMargin[kind === 'header' ? 'top' : 'bottom'], spacePolicy: prepared?.spacePolicy ?? 'none', shape: prepared?.shape, fallbackReason: prepared?.fallbackReason, gapTwips: prepared?.gapTwips ?? 0, wordFootprintVerified: false, quantization: prepared?.quantization ?? [] };
        }
        const headerBand = s.header ?? (intent.document as any).header, headerMode = bandReceipt.header.mode;
        const emptySpace = deriveHeaderSpace({ effectiveFirstEmpty: !headerBand || !['all', 'first'].includes(headerMode), effectiveDefaultEmpty: !headerBand || !['all', 'continuation'].includes(headerMode), previousDistanceTwips: margin.header });
        margin.header = emptySpace.nativeDistanceTwips;
        bandReceipt.header.nativeDistanceTwips = margin.header;
        bandReceipt.header.emptySpace = emptySpace;
        const capacity = (first: boolean) => { const visible = s.headerMode === 'all' || s.headerMode === (first ? 'first' : 'continuation'), top = dynamicHeader && visible ? estimated.top : margin.top; return { topTwips: top, bottomTwips: margin.bottom, headerVisible: bandReceipt.header.spacePolicy !== 'none' && bandReceipt.header.mode !== 'none' && visible, bodyHeightPt: (ph * 20 - top - margin.bottom) / 20, estimated: true, wordFootprintVerified: false }; };
        const capacityByPageType = { first: capacity(true), continuation: capacity(false) }, bodyHeight = Math.min(capacityByPageType.first.bodyHeightPt, capacityByPageType.continuation.bodyHeightPt), originalBody = (ph * 20 - sourceMargin.top - sourceMargin.bottom) / 20;
        if (bodyHeight <= 0 || (estimated.top - sourceMargin.top + estimated.bottom - sourceMargin.bottom) / 20 > originalBody * .4 + 1e-6)
            fail('DOCX_CAPABILITY_UNSUPPORTED', 'sections.' + index + '.page', 'Band reservations exceed body fit envelope');
        for (const block of intent.textBlocks.filter(t => t.scope === 'nodes' && (intent.document.sourceMap as any)[t.nodeId].sectionId === s.sectionId)) {
            const n = nodes[block.nodeId], style = required(intent.styles[block.styleId], 'styles'), intrinsic = n.props.heightMode === 'fixed' ? toPoints(n.props.height) : Math.max(style.line.twips / 20, concreteFontBounds(intent, style.font.id, style.sizeHalfPoints).maxHeight);
            if (intrinsic > bodyHeight)
                fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + block.nodeId, 'A native line/fixed spacer exceeds section body capacity');
        }
        for (const n of Object.values(nodes) as any[])
            if (n.type === 'image' && (intent.document.sourceMap as any)[n.id].sectionId === s.sectionId) {
                let padding = 0;
                for (const t of intent.tables)
                    for (const c of t.cells)
                        if (nodes[c.nodeId].childIds.includes(n.id))
                            padding = (c.paddingTwips.top + c.paddingTwips.bottom) / 20 + 1;
                if (toPoints(n.props.height) + 1 + padding > bodyHeight)
                    fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + n.id, 'Image frame and paragraph footprint exceed section body capacity');
            }
        const scoped = new Bookmark({ id: ctx.sectionName, children: [] });
        const special = (id: string): FileChild[] => { const n = nodes[id]; if (n.type === 'page-break')
            return [new Paragraph({ children: [new PageBreak()], run: { size: 2, sizeComplexScript: 2 }, spacing: { before: 0, after: 0, line: 20 } })]; if (n.type === 'line')
            return [nativeRule(n, pw - toPoints(page.margin.left) - toPoints(page.margin.right)).paragraph]; if (n.type === 'table-of-contents')
            return [new TableOfContents('Contents', { headingStyleRange: '1-3', useAppliedParagraphOutlineLevel: true, hyperlink: true, beginDirty: true, ...(n.props.scope?.kind === 'section' ? { entriesFromBookmark: ctx.sectionName } : {}) })]; fail('DOCX_CAPABILITY_UNSUPPORTED', 'nodes.' + id, 'Unknown body capability'); };
        const flow = take(buildBodyFlow(intent, { sectionId: s.sectionId, navigation: ctx, special }));
        let children: FileChild[] = flow.children;
        if (!children.length)
            children = [structuralParagraph()];
        if (hasScopedToc) {
            const start = structuralParagraph(), end = structuralParagraph();
            start.addChildElement(scoped.start);
            end.addChildElement(scoped.end);
            children = [start, ...children, end];
        }
        const startAt = mode === 'restart' ? (numbering.startAt ?? 1) : mode !== 'exclude' && firstIncluded && leadingExcluded ? 1 : undefined;
        if (mode !== 'exclude')
            firstIncluded = false;
        sections.push({ properties: { type: SectionType.NEXT_PAGE, titlePage: true, page: { size: { width: Math.round(210 * 72 / 25.4 * 20), height: Math.round(297 * 72 / 25.4 * 20), orientation: page.orientation === 'portrait' ? PageOrientation.PORTRAIT : PageOrientation.LANDSCAPE }, margin, pageNumbers: startAt === undefined ? {} : { start: startAt } } }, headers: groups.header, footers: groups.footer, children });
        receipts.push({ sectionId: s.sectionId, role: s.role, sourceKind: s.sourceKind, numbering: { ...numbering, visibility: hideNumbers ? 'hide' : 'show', nativeStart: startAt }, header: bandReceipt.header, footer: bandReceipt.footer, sourceMarginTwips: sourceMargin, reservedMarginTwips: margin, nativeMarginTwips: { ...margin }, estimatedMaximumMarginTwips: { ...estimated }, capacityByPageType, maximumBandReservation: !dynamicHeader, bodyHeightBasis: 'minimum-estimated-page-type', bodyHeightPt: bodyHeight, structuralScopeParagraphs: hasScopedToc ? 2 : 0, tableSpaces: flow.receipt.tableSpaces, tableSeparators: flow.receipt.tableSeparators, wordPaginationVerified: false });
    }
    return { sections, receipts, anchors: [...anchors].map(([source]) => ({ source, name: bookmarkName('a', source) })), leadingExcluded, imageReferences };
}
