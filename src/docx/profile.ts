import { required } from './types.js';
import type { ResolvedDocument, ResourceSnapshot, DocxProfile, Preflight, ExportIntent, EffectiveStyle, Result, NormalizedText } from './types.js';
import { capture, fail, freeze } from './types.js';
import { hash, snapshotResources, type PrivateResources } from './resources.js';
import { toPoints, toTwips, columnGrid } from './units.js';
import { normalizeBlock } from './text-intent.js';
export const defaultProfile: DocxProfile = freeze({ id: 'docx-native-flow/1', stage: 'intent-only', limits: { maxNodes: 50000, maxResourceBytes: 16 * 1024 * 1024, maxImagePixels: 4000000 } });
interface Capsule {
    document: ResolvedDocument;
    resources: PrivateResources;
    styles: Record<string, EffectiveStyle>;
    texts: NormalizedText[];
    tables: ExportIntent['tables'];
    profile: DocxProfile;
}
const capsules = new WeakMap<Preflight, Capsule>();
const intentOrigins = new WeakMap<ExportIntent, Preflight>();
const own = (o: any, k: string) => Object.hasOwn(o, k);
const obj = (o: any) => o !== null && typeof o === 'object' && !Array.isArray(o);
const name = (v: any) => typeof v === 'string' && v.trim().length > 0 && v.length <= 2048 && !/[\x00-\x1f\x7f]/u.test(v);
function requireValue(ok: any, path: string, message: string): asserts ok { if (!ok)
    fail('DOCX_INPUT_INVALID', path, message); }
function keys(o: any, allowed: string[], path: string) { requireValue(obj(o), path, 'Expected object'); for (const k of Object.keys(o))
    requireValue(allowed.includes(k), path + '.' + k, 'Unknown source property'); }
function idList(ids: any, path: string) { requireValue(Array.isArray(ids) && ids.every(name) && new Set(ids).size === ids.length, path, 'Expected unique node ID list'); }
function jsonSnapshot(input: unknown, max: number): any {
    let count = 0, chars = 0;
    const active = new Set<object>();
    function check(v: any, depth: number) {
        if (++count > Math.max(max * 30, 10000) || depth > 128)
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'document', 'U1 input graph/depth budget exceeded');
        if (typeof v === 'string') {
            chars += v.length;
            requireValue(v.isWellFormed() && chars <= 8000000, 'document', 'Malformed or excessive Unicode text');
            return;
        }
        if (v === null || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v))
            return;
        requireValue(typeof v === 'object' && v !== null, 'document', 'Input must contain JSON data only');
        requireValue(!active.has(v), 'document', 'Cyclic JSON input');
        requireValue(Array.isArray(v) || [Object.prototype, null].includes(Object.getPrototypeOf(v)), 'document', 'Non-JSON prototype');
        requireValue(!Object.getOwnPropertySymbols(v).length, 'document', 'Symbol properties are unsupported');
        active.add(v);
        for (const [k, desc] of Object.entries(Object.getOwnPropertyDescriptors(v))) {
            if (k === 'length' && Array.isArray(v))
                continue;
            requireValue('value' in desc && desc.enumerable, 'document.' + k, 'Accessors/non-enumerable properties are unsupported');
            check(desc.value, depth + 1);
        }
        active.delete(v);
    }
    check(input, 0);
    return structuredClone(input);
}
function validateProfile(p: DocxProfile) { keys(p, ['id', 'stage', 'limits'], 'profile'); requireValue(p.id === defaultProfile.id && p.stage === 'intent-only', 'profile', 'Only the U1 intent-only profile is enabled'); keys(p.limits, ['maxNodes', 'maxResourceBytes', 'maxImagePixels'], 'profile.limits'); for (const k of Object.keys(defaultProfile.limits) as (keyof DocxProfile['limits'])[])
    requireValue(Number.isSafeInteger(p.limits[k]) && p.limits[k] > 0 && p.limits[k] <= defaultProfile.limits[k], 'profile.limits.' + k, 'Invalid U1 budget'); }
function page(p: any, path: string) { keys(p, ['size', 'orientation', 'margin'], path); requireValue(p.size === 'A4' && ['portrait', 'landscape'].includes(p.orientation), path, 'Unsupported page geometry'); keys(p.margin, ['top', 'right', 'bottom', 'left'], path + '.margin'); for (const side of ['top', 'right', 'bottom', 'left'] as const)
    toTwips(p.margin[side], path + '.margin.' + side); const width = (p.orientation === 'portrait' ? 210 : 297) * 72 / 25.4, height = (p.orientation === 'portrait' ? 297 : 210) * 72 / 25.4; requireValue(toPoints(p.margin.left) + toPoints(p.margin.right) < width && toPoints(p.margin.top) + toPoints(p.margin.bottom) < height, path, 'Margins leave no page body'); return width - toPoints(p.margin.left) - toPoints(p.margin.right); }
function validUrl(v: any) { if (typeof v !== 'string' || !/^https?:\/\//i.test(v) || /[\s\x00-\x1f\x7f\\]/u.test(v))
    return false; try {
    const u = new URL(v);
    return !!u.hostname && !u.username && !u.password;
}
catch {
    return false;
} }
function deriveStyles(d: any, r: PrivateResources) {
    keys(d.styles, Object.keys(d.styles ?? {}), 'styles');
    requireValue(Object.keys(d.styles).length > 0, 'styles', 'At least one source style required');
    const styles: Record<string, EffectiveStyle> = Object.create(null);
    for (const [id, value] of Object.entries(d.styles)) {
        const s: any = value, p = 'styles.' + id;
        keys(s, d.schemaVersion === 1 ? ['fontFamilyKey', 'fontWeight', 'fontStyle', 'fontSize', 'lineHeightPt'] : ['font', 'fontSize', 'lineHeightPt'], p);
        requireValue(Number.isFinite(s.lineHeightPt) && s.lineHeightPt > 0, p + '.lineHeightPt', 'Expected positive minimum line height');
        keys(s.fontSize, ['unit', 'value'], p + '.fontSize');
        requireValue(s.fontSize.unit === 'pt' && Number.isFinite(s.fontSize.value) && s.fontSize.value > 0, p + '.fontSize', 'Invalid font size');
        if (!Number.isSafeInteger(s.fontSize.value * 2) || s.fontSize.value * 2 > 1638)
            fail('DOCX_GEOMETRY_UNREPRESENTABLE', p + '.fontSize', 'Font size must be exactly representable in native half-points');
        let matches;
        if (d.schemaVersion === 1) {
            requireValue(s.fontFamilyKey === 'sarabun' && ['normal', 'bold'].includes(s.fontWeight) && [undefined, 'normal', 'italic'].includes(s.fontStyle), p, 'Invalid legacy style');
            const alias = s.fontWeight === 'bold' ? (s.fontStyle === 'italic' ? 'boldItalic' : 'bold') : (s.fontStyle === 'italic' ? 'italic' : 'regular');
            matches = r.fonts.filter(f => f.legacyAlias === alias && f.identity.family.toLowerCase() === 'sarabun' && f.identity.weight === (s.fontWeight === 'bold' ? 700 : 400) && f.identity.style === (s.fontStyle === 'italic' ? 'italic' : 'normal'));
        }
        else {
            keys(s.font, ['kind', 'releaseId', 'weight', 'style'], p + '.font');
            if (s.font.kind === 'unselected')
                fail('FONT_NOT_SELECTED', p + '.font', 'A concrete library face must be selected');
            requireValue(s.font.kind === 'library' && name(s.font.releaseId) && Number.isInteger(s.font.weight) && s.font.weight >= 1 && s.font.weight <= 1000 && ['normal', 'italic'].includes(s.font.style), p + '.font', 'Invalid library font selection');
            matches = r.fonts.filter(f => f.identity.releaseId === s.font.releaseId && f.identity.weight === s.font.weight && f.identity.style === s.font.style);
        }
        if (matches.length !== 1)
            fail('FONT_FACE_UNAVAILABLE', p + '.font', 'Expected exactly one concrete source face');
        const identity = required(matches[0], p + '.font').identity;
        styles[id] = { font: identity, sizeHalfPoints: s.fontSize.value * 2, bold: !identity.nativeFamily && (d.schemaVersion === 1 ? s.fontWeight === 'bold' : identity.weight >= 700), italic: identity.style === 'italic', line: { rule: 'atLeast', twips: toTwips({ unit: 'pt', value: s.lineHeightPt }, p + '.lineHeightPt') } };
    }
    return styles;
}
function inspect(d: any, r: PrivateResources, profile: DocxProfile): Omit<Capsule, 'document' | 'resources' | 'profile'> {
    keys(d, ['schemaVersion', 'nodeModelVersion', 'template', 'book', 'styles', 'rootIds', 'nodes', 'sourceMap', 'sections', 'header', 'footer', 'formatInstances'], 'document');
    requireValue([1, 2].includes(d.schemaVersion) && [18, 19].includes(d.nodeModelVersion), 'document', 'Unsupported schema/model combination');
    keys(d.template, ['templateId', 'docKey', 'version'], 'template');
    requireValue(name(d.template.templateId) && name(d.template.docKey) && Number.isSafeInteger(d.template.version) && d.template.version > 0, 'template', 'Invalid template identity');
    keys(d.book, ['contentSlot', 'page'], 'book');
    requireValue(d.book.contentSlot === 'body', 'book.contentSlot', 'Invalid content slot');
    const baseWidth = page(d.book.page, 'book.page');
    const styles = deriveStyles(d, r), texts: NormalizedText[] = [], tables: any[] = [], anchors = new Set<string>(), references: {
        target: string;
        path: string;
    }[] = [];
    let nodeCount = 0;
    requireValue(Array.isArray(d.sections) && d.sections.length > 0, 'sections', 'Explicit authored sections required');
    const rootWidths = new Map<string, number>();
    const sectionIds = new Set<string>();
    if (d.sections !== undefined) {
        requireValue(Array.isArray(d.sections), 'sections', 'Invalid sections');
        for (const s of d.sections) {
            requireValue(name(s?.sectionId) && !s.sectionId.includes('~') && !sectionIds.has(s.sectionId), 'sections', 'Missing/duplicate section identity');
            sectionIds.add(s.sectionId);
        }
    }
    function sourceMap(map: any, nodes: any, path: string, knownInline: Set<string>) { keys(map, Object.keys(map ?? {}), path); for (const [id, value] of Object.entries(map)) {
        const v: any = value;
        keys(v, ['origin', 'sectionId', 'contentIndex', 'format', 'sourceId', 'groupId', 'groupIndex', 'itemIndex', 'repeatId', 'areaId', 'areaEntryIndex', 'areaFormatId'], path + '.' + id);
        requireValue(own(nodes, id) || knownInline.has(id), path + '.' + id, 'Source map references missing node');
        requireValue(name(v.sourceId), path + '.' + id, 'Source identity required');
        if (v.origin === 'authored')
            requireValue(v.contentIndex === undefined && v.format === undefined && name(v.sectionId), path + '.' + id, 'Invalid authored provenance');
        else
            requireValue([undefined, 'content'].includes(v.origin) && Number.isSafeInteger(v.contentIndex) && v.contentIndex >= 0 && name(v.format), path + '.' + id, 'Invalid content provenance');
        if (v.sectionId !== undefined)
            requireValue(sectionIds.has(v.sectionId), path + '.' + id, 'Unknown source section');
        for (const k of ['groupIndex', 'itemIndex', 'areaEntryIndex'])
            if (v[k] !== undefined)
                requireValue(Number.isSafeInteger(v[k]) && v[k] >= 0, path + '.' + id + '.' + k, 'Invalid source index');
        for (const k of ['groupId', 'repeatId', 'areaId', 'areaFormatId'])
            if (v[k] !== undefined)
                requireValue(name(v[k]) && !v[k].includes('~'), path + '.' + id + '.' + k, 'Invalid source grouping identity');
    } }
    function graph(nodes: any, roots: any, map: any, path: string, width: number, band = false) {
        keys(nodes, Object.keys(nodes ?? {}), path);
        idList(roots, path + '.rootIds');
        const visited = new Set<string>(), active = new Set<string>(), knownInline = new Set<string>(), cellWidths = new Map<string, number>();
        function visit(id: string, expected: string[] | undefined, available: number) {
            const at = path + '.' + id, n = nodes[id];
            requireValue(own(nodes, id) && obj(n) && n.id === id && name(n.id), at, 'Missing or inconsistent node identity');
            requireValue(!active.has(id) && !visited.has(id), at, 'Cycle or multiply-owned node');
            requireValue(!expected || expected.includes(n.type), at, 'Invalid node type for parent');
            if (++nodeCount > profile.limits.maxNodes)
                fail('DOCX_OUTPUT_BUDGET_EXCEEDED', at, 'Node budget exceeded', id);
            active.add(id);
            visited.add(id);
            const p = n.props;
            if (n.type === 'text-block') {
                keys(n, ['id', 'type', 'role', 'props', 'children'], at);
                keys(n.role, ['role'], at + '.role');
                requireValue(n.role.role === 'paragraph', at + '.role', 'Invalid text role');
                keys(p, ['textStyleId', 'textAlign', 'pageFieldLayout', 'heightMode', 'height', 'verticalAlign', 'sizing', 'anchorId', 'toc'], at + '.props');
                requireValue(own(styles, p.textStyleId), at + '.props.textStyleId', 'Missing style');
                requireValue([undefined, 'left', 'center', 'right'].includes(p.textAlign) && [undefined, 'content', 'fixed'].includes(p.heightMode), at + '.props', 'Invalid text alignment/height mode');
                if (p.sizing) {
                    keys(p.sizing, ['mode'], at + '.props.sizing');
                    requireValue(p.sizing.mode === 'content', at + '.props.sizing', 'Invalid content sizing');
                }
                if (p.pageFieldLayout !== undefined)
                    requireValue(p.pageFieldLayout === 'compact', at + '.props.pageFieldLayout', 'Unsupported field layout');
                if (p.verticalAlign !== undefined)
                    requireValue(['top', 'center', 'bottom'].includes(p.verticalAlign) && p.heightMode === 'fixed', at + '.props.verticalAlign', 'Invalid vertical alignment');
                requireValue(Array.isArray(n.children), at + '.children', 'Expected text inlines');
                for (const c of n.children) {
                    requireValue(obj(c) && name(c.id) && !knownInline.has(c.id) && !own(nodes, c.id), at + '.children', 'Invalid/duplicate inline ID');
                    knownInline.add(c.id);
                    const cp = at + '.children.' + c.id;
                    if (c.type === 'text') {
                        keys(c, ['id', 'type', 'text'], cp);
                        requireValue(typeof c.text === 'string' && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(c.text), cp, 'Invalid source text');
                    }
                    else if (c.type === 'line-break')
                        keys(c, ['id', 'type'], cp);
                    else if (c.type === 'system-page-field') {
                        keys(c, ['id', 'type', 'field', 'width'], cp);
                        requireValue(['current', 'total'].includes(c.field) && toPoints(c.width) > 0, cp, 'Invalid system field');
                    }
                    else if (['url', 'link', 'reference'].includes(c.type)) {
                        keys(c, c.type === 'url' ? ['id', 'type', 'value'] : c.type === 'link' ? ['id', 'type', 'text', 'url'] : ['id', 'type', 'text', 'target'], cp);
                        requireValue(c.type === 'url' ? validUrl(c.value) : typeof c.text === 'string' && !!c.text.trim() && (c.type === 'link' ? validUrl(c.url) : name(c.target)), cp, 'Invalid URL/reference');
                        if (c.type === 'reference')
                            references.push({ target: c.target, path: cp });
                    }
                    else
                        fail('DOCX_CAPABILITY_UNSUPPORTED', cp, 'Unsupported text inline', id);
                }
                if (p.heightMode === 'fixed') {
                    requireValue(p.height !== undefined && toPoints(p.height) > 0, at + '.props.height', 'Fixed height required');
                    if (n.children.some((c: any) => c.type !== 'text' || c.text.length > 0))
                        fail('DOCX_CAPABILITY_UNSUPPORTED', at, 'Nonempty fixed text frames are deferred', id);
                }
                else
                    requireValue(p.height === undefined, at + '.props.height', 'Unexpected height on content text');
                if (p.anchorId !== undefined) {
                    requireValue(name(p.anchorId) && !anchors.has(p.anchorId) && !band, at + '.props.anchorId', 'Missing/duplicate/invalid anchor');
                    anchors.add(p.anchorId);
                }
                if (p.toc) {
                    keys(p.toc, ['level'], at + '.props.toc');
                    requireValue(Number.isInteger(p.toc.level) && p.toc.level >= 1 && p.toc.level <= 3 && !band, at + '.props.toc', 'Invalid heading level');
                }
                const t = normalizeBlock(n, at, path, r.language), font = r.fonts.find(f => f.identity.id === required(styles[p.textStyleId], 'styles').font.id)!;
                for (const ch of t.text)
                    if (ch !== '\n' && !/\p{Default_Ignorable_Code_Point}/u.test(ch) && !font.glyph(ch.codePointAt(0)!))
                        fail('FONT_GLYPH_MISSING', at + '.children', 'Concrete source face has no glyph for U+' + ch.codePointAt(0)!.toString(16), id);
                texts.push(t);
            }
            else if (n.type === 'image') {
                keys(n, ['id', 'type', 'props'], at);
                keys(p, ['width', 'height', 'align', 'resourceId'], at + '.props');
                requireValue(name(p.resourceId) && [undefined, 'left', 'center', 'right'].includes(p.align) && toPoints(p.width) > 0 && toPoints(p.height) > 0, at + '.props', 'Invalid image frame');
                toTwips(p.width, at + '.props.width');
                toTwips(p.height, at + '.props.height');
                if (!r.images.has(p.resourceId))
                    fail('DOCX_RESOURCE_INVALID', at + '.props.resourceId', 'Missing verified image', id);
                if (toPoints(p.width) > available + 1e-6)
                    fail('DOCX_GEOMETRY_UNREPRESENTABLE', at + '.props.width', 'Image frame exceeds available width', id);
            }
            else if (n.type === 'line') {
                keys(n, ['id', 'type', 'props'], at);
                keys(p, ['align', 'width', 'thickness', 'color', 'spaceBefore', 'spaceAfter'], at + '.props');
                requireValue([undefined, 'left', 'center', 'right'].includes(p.align), at + '.props.align', 'Invalid line alignment');
                for (const k of ['width', 'thickness', 'spaceBefore', 'spaceAfter'])
                    if (p[k] !== undefined)
                        toTwips(p[k], at + '.props.' + k);
                if (p.color !== undefined)
                    requireValue(/^[0-9a-fA-F]{6}$/.test(p.color), at + '.props.color', 'Invalid RGB');
            }
            else if (n.type === 'page-break')
                keys(n, ['id', 'type'], at);
            else if (n.type === 'table-of-contents') {
                keys(n, ['id', 'type', 'props'], at);
                keys(p, ['textStyleId', 'scope'], at + '.props');
                requireValue(own(styles, p.textStyleId), at + '.props.textStyleId', 'Missing TOC style');
                if (p.scope !== undefined) {
                    keys(p.scope, ['kind'], at + '.props.scope');
                    requireValue(d.nodeModelVersion === 19 && ['section', 'document'].includes(p.scope.kind), at + '.props.scope', 'Invalid scoped TOC');
                }
            }
            else if (n.type === 'table') {
                keys(n, ['id', 'type', 'props', 'columns', 'rowIds', 'rowGroups'], at);
                keys(p, ['headerRowCount', 'repeatHeaderRows', 'headerFillColor', 'borderColor'], at + '.props');
                idList(n.rowIds, at + '.rowIds');
                requireValue(Array.isArray(n.columns) && n.columns.length > 0 && Number.isSafeInteger(p.headerRowCount) && p.headerRowCount >= 0 && p.headerRowCount <= n.rowIds.length && typeof p.repeatHeaderRows === 'boolean', at + '.props', 'Invalid table/header');
                for (const k of ['borderColor', 'headerFillColor'])
                    if (p[k] !== undefined)
                        requireValue(/^[0-9a-fA-F]{6}$/.test(p[k]), at + '.props.' + k, 'Invalid RGB');
                for (const c of n.columns)
                    keys(c, ['width'], at + '.columns');
                const grid = columnGrid(n.columns.map((c: any) => c.width));
                requireValue(grid.reduce((a, b) => a + b, 0) / 20 <= available + 0.05, at + '.columns', 'Table exceeds body width');
                requireValue(n.rowIds.length * n.columns.length <= profile.limits.maxNodes, at, 'Table grid exceeds U1 budget');
                const coverage = new Set<string>(), cells: any[] = [], placed: boolean[] = [];
                n.rowIds.forEach((rid: string, row: number) => { const rn = nodes[rid]; requireValue(rn?.type === 'table-row' && Array.isArray(rn.cellIds), at + '.rowIds', 'Invalid row'); rn.cellIds.forEach((cid: string, index: number) => { const c = nodes[cid]; requireValue(c?.type === 'table-cell', at + '.rowIds', 'Invalid cell'); const cp = c.props ?? {}, explicit = ['columnIndex', 'rowSpan', 'colSpan'].some(k => own(cp, k)); placed.push(explicit); const col = explicit ? cp.columnIndex : index, rs = cp.rowSpan ?? 1, cs = cp.colSpan ?? 1; requireValue(Number.isSafeInteger(col) && col >= 0 && Number.isSafeInteger(rs) && rs > 0 && Number.isSafeInteger(cs) && cs > 0 && row + rs <= n.rowIds.length && col + cs <= grid.length, at + '.' + cid, 'Invalid cell grid/span'); requireValue(!(row < p.headerRowCount && row + rs > p.headerRowCount), at + '.' + cid, 'Merge crosses repeated-header boundary'); for (let y = row; y < row + rs; y++)
                    for (let x = col; x < col + cs; x++) {
                        const k = y + ':' + x;
                        requireValue(!coverage.has(k), at + '.' + cid, 'Overlapping cells');
                        coverage.add(k);
                    } const pad = { top: 80, right: 80, bottom: 80, left: 80 }; if (cp.padding)
                    keys(cp.padding, ['top', 'right', 'bottom', 'left'], at + '.' + cid + '.padding'); for (const side of ['top', 'right', 'bottom', 'left'] as const)
                    pad[side] = cp.padding?.[side] === undefined ? 80 : toTwips(cp.padding[side], at + '.' + cid + '.padding.' + side); const w = grid.slice(col, col + cs).reduce((a, b) => a + b, 0); requireValue(w > pad.left + pad.right, at + '.' + cid, 'Padding leaves no content width'); cellWidths.set(cid, (w - pad.left - pad.right) / 20); cells.push({ nodeId: cid, paddingTwips: pad }); }); });
                requireValue(coverage.size === n.rowIds.length * grid.length && !(placed.some(Boolean) && placed.some(x => !x)), at, 'Incomplete/mixed explicit table grid');
                if (n.rowGroups !== undefined) {
                    requireValue(Array.isArray(n.rowGroups), at + '.rowGroups', 'Invalid row groups');
                    const groups = new Set<string>();
                    for (const g of n.rowGroups) {
                        keys(g, ['groupId', 'groupIndex', 'rowIds', 'prefixRowIds', 'firstMemberRowId', 'empty', 'keepStart', 'groupLabel'], at + '.rowGroups');
                        requireValue(name(g.groupId) && Number.isSafeInteger(g.groupIndex) && g.groupIndex >= 0 && !groups.has(g.groupId + ':' + g.groupIndex), at + '.rowGroups', 'Invalid/duplicate group');
                        groups.add(g.groupId + ':' + g.groupIndex);
                        idList(g.rowIds, at + '.rowGroups.rowIds');
                        idList(g.prefixRowIds, at + '.rowGroups.prefixRowIds');
                        requireValue(g.rowIds.every((x: string) => n.rowIds.includes(x)) && g.prefixRowIds.every((x: string) => g.rowIds.includes(x)) && g.rowIds.includes(g.firstMemberRowId) && typeof g.empty === 'boolean' && typeof g.keepStart === 'boolean', at + '.rowGroups', 'Invalid group membership');
                        if (g.groupLabel !== undefined) {
                            const label = g.groupLabel, lp = at + '.rowGroups.groupLabel';
                            keys(label, ['cellId', 'sourceCellId', 'memberCount'], lp);
                            const first = nodes[g.firstMemberRowId], cell = nodes[label.cellId];
                            requireValue(name(label.cellId) && name(label.sourceCellId) && Number.isSafeInteger(label.memberCount) && label.memberCount === (g.empty ? 0 : g.rowIds.length - g.prefixRowIds.length), lp, 'Invalid group label membership');
                            requireValue(g.keepStart && first?.cellIds?.includes(label.cellId) && cell?.type === 'table-cell' && cell.props.rowSpan === Math.max(1, label.memberCount), lp, 'Group label must be the native merge origin at the first member');
                        }
                    }
                }
                tables.push({ nodeId: id, scope: path, sourceId: map?.[id]?.sourceId, columnTwips: grid, cells });
                for (const rid of n.rowIds)
                    visit(rid, ['table-row'], available);
            }
            else if (n.type === 'table-row') {
                keys(n, ['id', 'type', 'props', 'cellIds'], at);
                keys(p, ['allowBreak'], at + '.props');
                requireValue(typeof p.allowBreak === 'boolean', at + '.props.allowBreak', 'Expected row split preference');
                idList(n.cellIds, at + '.cellIds');
                for (const cid of n.cellIds)
                    visit(cid, ['table-cell'], cellWidths.get(cid) ?? available);
            }
            else if (n.type === 'table-cell') {
                keys(n, ['id', 'type', 'props', 'childIds'], at);
                keys(p, ['columnIndex', 'colSpan', 'rowSpan', 'padding', 'fillColor'], at + '.props');
                if (p.fillColor !== undefined)
                    requireValue(/^[0-9a-fA-F]{6}$/.test(p.fillColor), at + '.props.fillColor', 'Invalid RGB');
                idList(n.childIds, at + '.childIds');
                for (const cid of n.childIds)
                    visit(cid, ['text-block', 'image'], available);
            }
            else if (n.type === 'columns' && band) {
                keys(n, ['id', 'type', 'props', 'columns'], at);
                keys(p, ['gap'], at + '.props');
                const gap = p.gap ? toPoints(p.gap) : 0;
                requireValue(Array.isArray(n.columns) && n.columns.length > 0, at + '.columns', 'Empty weighted band');
                const total = n.columns.reduce((a: number, c: any) => a + c.weight, 0), usable = available - gap * (n.columns.length - 1);
                requireValue(usable > 0 && Number.isFinite(total) && total > 0, at + '.columns', 'Invalid band widths');
                for (const c of n.columns) {
                    keys(c, ['weight', 'childIds'], at + '.columns');
                    requireValue(Number.isFinite(c.weight) && c.weight > 0, at + '.columns', 'Invalid band weight');
                    idList(c.childIds, at + '.columns.childIds');
                    for (const cid of c.childIds)
                        visit(cid, ['text-block', 'image', 'line', 'columns'], usable * c.weight / total);
                }
            }
            else
                fail('DOCX_CAPABILITY_UNSUPPORTED', at, 'Unsupported node capability', id);
            active.delete(id);
        }
        for (const root of roots)
            visit(root, band ? ['text-block', 'image', 'line', 'columns'] : ['text-block', 'image', 'line', 'table', 'page-break', 'table-of-contents'], !band && path === 'nodes' ? (rootWidths.get(root) ?? width) : width);
        requireValue(visited.size === Object.keys(nodes).length, path, 'Unreachable nodes must not be silently dropped');
        sourceMap(map, nodes, path + '.sourceMap', knownInline);
        for (const id of roots)
            requireValue(own(map, id), path + '.sourceMap.' + id, 'Root provenance missing');
    }
    function band(b: any, path: string, pg: any) { keys(b, ['rootIds', 'nodes', 'sourceMap', 'baseTextStyleId', 'sizing', 'gap', 'placement'], path); requireValue(own(styles, b.baseTextStyleId), path + '.baseTextStyleId', 'Missing band style'); let width = (pg.orientation === 'portrait' ? 210 : 297) * 72 / 25.4 - toPoints(pg.margin.left) - toPoints(pg.margin.right); if (b.placement) {
        keys(b.placement, ['mode', 'left', 'right', 'offset'], path + '.placement');
        requireValue(b.placement.mode === 'page', path + '.placement', 'Invalid placement mode');
        for (const k of ['left', 'right', 'offset'])
            toTwips(b.placement[k], path + '.placement.' + k);
        width = (pg.orientation === 'portrait' ? 210 : 297) * 72 / 25.4 - toPoints(b.placement.left) - toPoints(b.placement.right);
    } requireValue(width > 0, path, 'Band leaves no width'); if (b.gap)
        toTwips(b.gap, path + '.gap'); if (b.sizing) {
        keys(b.sizing, b.sizing.mode === 'fixed' ? ['mode', 'height'] : ['mode', 'minHeight', 'maxHeight'], path + '.sizing');
        requireValue(['content', 'fixed'].includes(b.sizing.mode), path + '.sizing', 'Invalid band sizing');
        for (const k of ['height', 'minHeight', 'maxHeight'])
            if (b.sizing[k] !== undefined)
                toTwips(b.sizing[k], path + '.sizing.' + k);
        if (b.sizing.mode === 'fixed')
            requireValue(toPoints(b.sizing.height) > 0, path + '.sizing.height', 'Fixed band height required');
        if (b.sizing.minHeight && b.sizing.maxHeight)
            requireValue(toPoints(b.sizing.minHeight) <= toPoints(b.sizing.maxHeight), path + '.sizing', 'Band size bounds inverted');
    } graph(b.nodes, b.rootIds, b.sourceMap, path + '.nodes', width, true); }
    if (d.sections !== undefined) {
        const roots: string[] = [];
        for (const [i, s] of d.sections.entries()) {
            const p = 'sections.' + i;
            keys(s, ['numbering', 'header', 'footer', 'headerMode', 'footerMode', 'role', 'sourceKind', 'sectionId', 'pageLayoutId', 'page', 'rootIds'], p);
            requireValue(name(s.pageLayoutId) && !s.pageLayoutId.includes('~') && ['body', 'cover'].includes(s.role) && ['authored', 'blank'].includes(s.sourceKind) && (s.role !== 'cover' || i === 0 && s.sourceKind === 'authored') && (s.sourceKind !== 'blank' || s.rootIds?.length === 0), p, 'Invalid section');
            const bodyWidth = page(s.page, p + '.page');
            idList(s.rootIds, p + '.rootIds');
            for (const root of s.rootIds)
                rootWidths.set(root, bodyWidth);
            roots.push(...s.rootIds);
            for (const kind of ['header', 'footer']) {
                requireValue(['all', 'first', 'continuation', 'none'].includes(s[kind + 'Mode']), p + '.' + kind + 'Mode', 'Invalid band mode');
                if (s[kind])
                    band(s[kind], p + '.' + kind, s.page);
            }
            if (s.numbering) {
                keys(s.numbering, ['mode', 'startAt', 'visibility'], p + '.numbering');
                requireValue(['continue', 'restart', 'exclude'].includes(s.numbering.mode) && [undefined, 'show', 'hide'].includes(s.numbering.visibility), p + '.numbering', 'Invalid numbering');
                if (s.numbering.startAt !== undefined)
                    requireValue(s.numbering.mode === 'restart' && Number.isSafeInteger(s.numbering.startAt) && s.numbering.startAt >= 1, p + '.numbering', 'Invalid numbering start');
            }
        }
        requireValue(JSON.stringify(roots) === JSON.stringify(d.rootIds), 'rootIds', 'Section roots and document roots differ');
    }
    for (const kind of ['header', 'footer'])
        if (d[kind])
            band(d[kind], kind, d.book.page);
    graph(d.nodes, d.rootIds, d.sourceMap, 'nodes', baseWidth);
    const members = new Map<string, string>();
    for (const section of d.sections) {
        const pending = [...section.rootIds];
        while (pending.length) {
            const id = pending.pop()!;
            requireValue(!members.has(id), 'sections', 'Multiply-owned section member');
            members.set(id, section.sectionId);
            const n = d.nodes[id];
            if (n.type === 'text-block')
                for (const c of n.children) {
                    requireValue(!members.has(c.id), 'sections', 'Multiply-owned inline');
                    members.set(c.id, section.sectionId);
                }
            for (const key of ['rowIds', 'cellIds', 'childIds'])
                if (n[key])
                    pending.push(...n[key]);
        }
    }
    for (const [id, sectionId] of members) {
        const source = d.sourceMap[id];
        requireValue(source?.origin === 'authored' && source.sectionId === sectionId, 'sourceMap.' + id, 'Every body member requires matching authored section provenance');
    }
    for (const ref of references)
        requireValue(anchors.has(ref.target), ref.path + '.target', 'Missing reference destination');
    if (d.formatInstances !== undefined) {
        requireValue(Array.isArray(d.formatInstances), 'formatInstances', 'Invalid format instances');
        for (const [i, f] of d.formatInstances.entries()) {
            const p = 'formatInstances.' + i;
            keys(f, ['sectionId', 'areaId', 'areaEntryIndex', 'areaFormatId', 'format', 'sizing', 'rootIds', 'rootStartIndex'], p);
            keys(f.sizing, ['mode', 'height'], p + '.sizing');
            if (f.sizing.mode === 'fixed')
                fail('DOCX_CAPABILITY_UNSUPPORTED', p, 'Fixed format budgets are deferred');
            requireValue(f.sizing.mode === 'auto' && f.sizing.height === undefined && sectionIds.has(f.sectionId) && name(f.areaId) && name(f.areaFormatId) && name(f.format) && Number.isSafeInteger(f.areaEntryIndex) && f.areaEntryIndex >= 0, p, 'Invalid auto format instance');
            idList(f.rootIds, p + '.rootIds');
            const ownerSection = d.sections.find((s: any) => s.sectionId === f.sectionId);
            requireValue(f.rootIds.every((id: string) => ownerSection.rootIds.includes(id)), p + '.rootIds', 'Format roots must belong to their source section');
            if (f.rootIds.length) {
                const at = ownerSection.rootIds.indexOf(f.rootIds[0]);
                requireValue(JSON.stringify(ownerSection.rootIds.slice(at, at + f.rootIds.length)) === JSON.stringify(f.rootIds), p + '.rootIds', 'Format roots must be contiguous and ordered');
            }
            if (f.rootStartIndex !== undefined) {
                const section = d.sections.find((s: any) => s.sectionId === f.sectionId);
                requireValue(Number.isSafeInteger(f.rootStartIndex) && f.rootStartIndex >= 0 && f.rootStartIndex <= section.rootIds.length && JSON.stringify(section.rootIds.slice(f.rootStartIndex, f.rootStartIndex + f.rootIds.length)) === JSON.stringify(f.rootIds), p + '.rootStartIndex', 'Invalid format root index');
            }
        }
    }
    return { styles, texts, tables };
}
export function preflightDocx(document: Readonly<ResolvedDocument>, resources: ResourceSnapshot, profile: DocxProfile = defaultProfile): Result<Preflight> { return capture(() => { validateProfile(profile); const p = structuredClone(profile), d = jsonSnapshot(document, p.limits.maxNodes), r = snapshotResources(resources, p), mapped = inspect(d, r, p); const value: Preflight = freeze({ kind: 'preflight', profileId: p.id, sourceDigest: hash(JSON.stringify(d)), resourceIdentities: structuredClone(r.identities), rendered: false }); capsules.set(value, { document: d, resources: r, profile: p, ...mapped }); return value; }); }
export function deriveExportIntent(preflight: Preflight): Result<ExportIntent> { return capture(() => { const capsule = capsules.get(preflight); if (!capsule)
    fail('DOCX_INPUT_INVALID', 'preflight', 'Expected a genuine immutable U1 preflight result'); const intent: ExportIntent = freeze({ kind: 'export-intent', sourceDigest: preflight.sourceDigest, profileId: preflight.profileId, document: structuredClone(capsule.document), styles: structuredClone(capsule.styles), textBlocks: structuredClone(capsule.texts), tables: structuredClone(capsule.tables), resourceIdentities: structuredClone(capsule.resources.identities), rendered: false, serializationAvailable: false }); intentOrigins.set(intent, preflight); return intent; }); }
// Internal defensive accessor for later writer modules; never exports live bytes.
export function snapshotResourceBytes(preflight: Preflight, kind: "font" | "image", id: string): Uint8Array { const capsule = capsules.get(preflight); if (!capsule)
    fail("DOCX_INPUT_INVALID", "preflight", "Expected genuine preflight"); const resource = kind === "font" ? capsule.resources.fonts.find(f => f.identity.id === id) : capsule.resources.images.get(id); if (!resource)
    fail("DOCX_RESOURCE_INVALID", "resources." + id, "Snapshot resource missing"); return Uint8Array.from(resource.bytes); }
export function requireGenuineIntent(intent: ExportIntent): void { if (!intentOrigins.has(intent))
    fail("DOCX_INPUT_INVALID", "intent", "Expected genuine immutable derived intent"); }
export function intentResourceBytes(intent: ExportIntent, kind: "font" | "image", id: string): Uint8Array { requireGenuineIntent(intent); return snapshotResourceBytes(intentOrigins.get(intent)!, kind, id); }
export function requireIntentGlyphs(intent: ExportIntent, fontId: string, text: string, path: string): void { requireGenuineIntent(intent); const font = capsules.get(intentOrigins.get(intent)!)!.resources.fonts.find(f => f.identity.id === fontId); if (!font)
    fail('FONT_FACE_UNAVAILABLE', path, 'Verified font missing'); for (const ch of text)
    if (ch !== '\n' && !/\p{Default_Ignorable_Code_Point}/u.test(ch) && !font!.glyph(ch.codePointAt(0)!))
        fail('FONT_GLYPH_MISSING', path, 'Generated content requires missing glyph U+' + ch.codePointAt(0)!.toString(16)); }

export function snapshotDocxDocument(input:unknown):ResolvedDocument {return jsonSnapshot(input,defaultProfile.limits.maxNodes);}
