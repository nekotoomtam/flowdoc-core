import { required } from './types.js';
import { Document, Packer, type IPropertiesOptions } from 'docx';
import { createRequire } from 'node:module';
import { posix } from 'node:path';
const JSZip = createRequire(import.meta.url)('jszip');
import { defaultProfile, preflightDocx, deriveExportIntent, requireGenuineIntent, intentResourceBytes, requireIntentGlyphs } from './profile.js';
import { fail, MappingError, freeze, type ResolvedDocument, type ResourceSnapshot, type ExportIntent, type Result, type DocxProfile } from './types.js';
import { hash } from './resources.js';
import { buildSections } from './sections.js';
import { nativeRunStyle } from './text.js';
import { fieldDigitBudget } from './fields.js';
export interface WriteOptions {
    profile?: DocxProfile;
    signal?: AbortSignal;
    maxOutputBytes?: number;
    maxPackageNodes?: number;
    maxImageReferences?: number;
}
/** write is private staging. commit publishes atomically and must honor signal; abort discards staged bytes. */
export interface DocxSink {
    write(bytes: Uint8Array): Promise<void>;
    commit(receipt: DocxReceipt, signal?: AbortSignal): Promise<void>;
    abort(reason: unknown): Promise<void>;
}
export interface DocxReceipt {
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    sha256: string;
    bytes: number;
    sourceDigest: string;
    profileId: string;
    fieldRefresh: 'required';
    wordVerified: false;
    resources: readonly unknown[];
    autoFormats: readonly unknown[];
    sections: any[];
    bookmarks: {
        source: string;
        name: string;
    }[];
    numbering: {
        leadingExcludedSections: number;
        fieldDigitEnvelope: number;
    };
    adaptations: unknown[];
    buffered: true;
}
const take = <T>(r: Result<T>): T => { if (!r.ok) {
    const e = required(r.issues[0], 'issues');
    fail(e.code, e.path ?? 'document', e.message);
} return r.value; };
function cancelled(options: WriteOptions) { if (options.signal?.aborted)
    fail('DOCX_CANCELLED', 'options.signal', 'Export cancelled before publication'); }
function embeddedFonts(intent: ExportIntent): NonNullable<IPropertiesOptions['fonts']> {
    const all = intent.resourceIdentities.filter((r: any) => r.family) as any[], families = new Map<string, Set<string | undefined>>();
    for (const [id, s] of Object.entries(intent.styles)) {
        if (![400, 700].includes(s.font.weight))
            fail('DOCX_CAPABILITY_UNSUPPORTED', 'styles.' + id + '.font', 'Native embedding slots require verified regular/bold faces');
        const releases = families.get(s.font.family) ?? new Set<string | undefined>();
        releases.add(s.font.releaseId);
        families.set(s.font.family, releases);
    }
    return [...families].map(([name, releases]) => { if (releases.size !== 1)
        fail('DOCX_CAPABILITY_UNSUPPORTED', 'resources.fonts', 'One family cannot select multiple releases in native face slots'); const release = [...releases][0], get = (weight: number, style: string, required = false) => { const matches = all.filter(f => f.family === name && f.releaseId === release && f.weight === weight && f.style === style); if (matches.length > 1 || required && matches.length !== 1)
        fail('FONT_FACE_UNAVAILABLE', 'resources.fonts', 'Embedding needs one unambiguous concrete regular face'); return matches[0] ? Buffer.from(intentResourceBytes(intent, 'font', matches[0].id)) : undefined; }; const bold = get(700, 'normal'), italic = get(400, 'italic'), boldItalic = get(700, 'italic'); return { name, data: required(get(400, 'normal', true), 'fonts.regular'), ...(bold ? { bold } : {}), ...(italic ? { italic } : {}), ...(boldItalic ? { boldItalic } : {}) }; });
}
async function cleanup(sink: DocxSink, error: unknown): Promise<Result<DocxReceipt>> { const issue = error instanceof MappingError ? error.issue : { code: 'DOCX_SERIALIZATION_FAILED', path: 'writer', message: error instanceof Error ? error.message : 'Export failed' }; const issues = [issue]; try {
    await sink?.abort(error);
}
catch (e) {
    issues.push({ code: 'DOCX_CLEANUP_FAILED', path: 'sink.abort', message: e instanceof Error ? e.message : 'Cleanup failed' });
} return { ok: false, issues, warnings: [] }; }
export async function writeDocx(intent: ExportIntent, sink: DocxSink, options: WriteOptions = {}): Promise<Result<DocxReceipt>> {
    try {
        options = { ...options };
        cancelled(options);
        for (const key of Object.keys(options))
            if (!['profile', 'signal', 'maxOutputBytes', 'maxPackageNodes', 'maxImageReferences'].includes(key))
                fail('DOCX_INPUT_INVALID', 'options.' + key, 'Unknown output option');
        requireGenuineIntent(intent);
        if (!sink || typeof sink.write !== 'function' || typeof sink.commit !== 'function' || typeof sink.abort !== 'function')
            fail('DOCX_INPUT_INVALID', 'sink', 'A staged write/atomic commit/abort sink is required');
        for (const [key, defaultValue] of Object.entries({ maxOutputBytes: 32 * 1024 * 1024, maxPackageNodes: 50000, maxImageReferences: 10000 })) {
            const value = (options as any)[key] ?? defaultValue;
            if (!Number.isSafeInteger(value) || value < 0 || value > defaultValue)
                fail('DOCX_INPUT_INVALID', 'options.' + key, 'Invalid or excessive output budget');
        }
        const allNodes = [...Object.values(intent.document.nodes), ...[(intent.document as any).header, (intent.document as any).footer, ...(intent.document.sections as any[]).flatMap(s => [s.header, s.footer])].filter(Boolean).flatMap(b => Object.values(b.nodes))] as any[];
        if (allNodes.length > (options.maxPackageNodes ?? 50000))
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'document.nodes', 'Package node budget exceeded');
        for (const block of intent.textBlocks)
            if (block.spans.some(s => s.type === 'system-page-field'))
                requireIntentGlyphs(intent, required(intent.styles[block.styleId], 'styles').font.id, '0123456789', block.path + '.generated-page-digits');
        for (const n of Object.values(intent.document.nodes) as any[])
            if (n.type === 'table-of-contents') {
                let text = '0123456789. ';
                for (const block of intent.textBlocks)
                    if (block.scope === 'nodes' && (intent.document.nodes[block.nodeId] as any).props?.toc && (n.props.scope?.kind !== 'section' || (intent.document.sourceMap as any)[n.id].sectionId === (intent.document.sourceMap as any)[block.nodeId].sectionId))
                        text += block.text;
                requireIntentGlyphs(intent, required(intent.styles[n.props.textStyleId], 'styles').font.id, text, 'nodes.' + n.id + '.generated-contents');
            }
        const built = buildSections(intent), images = Object.values(intent.document.nodes).filter((n: any) => n.type === 'image').length + built.imageReferences;
        if (images > (options.maxImageReferences ?? 10000))
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'resources.images', 'Package image reference budget exceeded');
        const fonts = embeddedFonts(intent), tocStyles = [...new Set((Object.values(intent.document.nodes) as any[]).filter(n => n.type === 'table-of-contents').map(n => n.props.textStyleId))];
        if (tocStyles.length > 1)
            fail('DOCX_CAPABILITY_UNSUPPORTED', 'styles', 'Multiple distinct TOC styles need a verified per-TOC style mapping');
        const styles = tocStyles.length ? { paragraphStyles: [1, 2, 3].map(level => ({ id: 'TOC' + level, name: 'TOC ' + level, run: nativeRunStyle(required(intent.styles[required(tocStyles[0], 'toc.style')], 'toc.style')), paragraph: { spacing: { before: 0, after: 0, line: required(intent.styles[required(tocStyles[0], 'toc.style')], 'toc.style').line.twips, lineRule: 'atLeast' as const } } })) } : undefined;
        cancelled(options);
        await Promise.resolve();
        cancelled(options);
        const bytes = await Packer.toBuffer(new Document({ sections: built.sections, fonts, features: { updateFields: true }, ...(styles ? { styles } : {}) }));
        cancelled(options);
        if (bytes.length > (options.maxOutputBytes ?? 32 * 1024 * 1024))
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'output', 'Buffered DOCX exceeds output byte budget');
        const zip = await JSZip.loadAsync(bytes);
        let xmlNodes = 0, drawings = 0;
        for (const name of Object.keys(zip.files)) {
            if (!/\.(xml|rels)$/.test(name))
                continue;
            cancelled(options);
            const xml = await zip.file(name).async('string');
            xmlNodes += (xml.match(/<(?![!?/])[A-Za-z_][\w:.-]*(?=[\s/>])/g) || []).length;
            drawings += (xml.match(/<wp:docPr\b/g) || []).length;
            if (xmlNodes > (options.maxPackageNodes ?? 50000) || drawings > (options.maxImageReferences ?? 10000))
                fail('DOCX_OUTPUT_BUDGET_EXCEEDED', name, 'Expanded XML node/drawing budget exceeded');
            if (name.endsWith('.rels')) {
                const prefix = name === '_rels/.rels' ? '' : posix.dirname(posix.dirname(name));
                for (const rel of xml.match(/<Relationship\b[^>]*>/g) || []) {
                    if (/TargetMode="External"/.test(rel))
                        continue;
                    const target = /Target="([^"]+)"/.exec(rel)?.[1];
                    if (!target || !zip.file(posix.normalize(posix.join(prefix, target))))
                        fail('DOCX_SERIALIZATION_FAILED', name, 'Unresolved package relationship');
                }
            }
        }
        const adaptations: any[] = built.receipts.flatMap(s => s.tableSpaces.map((t: any) => ({ kind: 'table-space-policy', ...t }))), columnPaths = new Set<string | undefined>();
        for (const table of intent.tables) {
            const source: any = (intent.document.nodes as any)[table.nodeId];
            table.columnTwips.forEach((twips, i) => { const path = 'document.nodes.' + table.nodeId + '.columns.' + i + '.width', length = source.columns[i].width, pt = length.unit === 'pt' ? length.value : length.value * 72 / 25.4; columnPaths.add(path); if (twips / 20 !== pt)
                adaptations.push({ kind: 'column-grid-quantization', path, source: length, twips, errorPt: twips / 20 - pt }); });
        }
        for (const [id, style] of Object.entries(intent.styles)) {
            const sourcePt = (intent.document.styles as any)[id].lineHeightPt;
            if (style.line.twips / 20 !== sourcePt)
                adaptations.push({ kind: 'minimum-line-quantization', path: 'document.styles.' + id + '.lineHeightPt', sourcePt, twips: style.line.twips, errorPt: style.line.twips / 20 - sourcePt });
        }
        function lengths(v: any, path: string) { if (columnPaths.has(path))
            return; if (!v || typeof v !== 'object')
            return; if (['pt', 'mm'].includes(v.unit) && typeof v.value === 'number') {
            const pt = v.unit === 'pt' ? v.value : v.value * 72 / 25.4, twips = Math.round(pt * 20);
            if (twips / 20 !== pt)
                adaptations.push({ kind: 'scalar-quantization', path, source: v, twips, errorPt: twips / 20 - pt });
        }
        else
            for (const [key, x] of Object.entries(v))
                lengths(x, path + '.' + key); }
        lengths(intent.document, 'document');
        for (const section of built.receipts)
            for (const kind of ['header', 'footer'])
                adaptations.push(...section[kind].quantization);
        for (const s of built.receipts)
            if (JSON.stringify(s.sourceMarginTwips) !== JSON.stringify({ top: s.reservedMarginTwips.top, right: s.reservedMarginTwips.right, bottom: s.reservedMarginTwips.bottom, left: s.reservedMarginTwips.left }))
                adaptations.push({ kind: 'maximum-band-reservation', sectionId: s.sectionId, source: s.sourceMarginTwips, reserved: s.reservedMarginTwips });
        for (const s of built.receipts) {
            adaptations.push({ kind: 'empty-header-space-policy', sectionId: s.sectionId, ...s.header.emptySpace, sourceOffsetTwips: s.header.offsetTwips, wordVerified: false });
            if (s.header.spacePolicy === 'native-visible-header')
                adaptations.push({ kind: 'native-visible-header-space', sectionId: s.sectionId, shape: s.header.shape, nativeTopTwips: s.nativeMarginTwips.top, gapTwips: s.header.gapTwips, capacityByPageType: s.capacityByPageType, estimated: true, wordVerified: false });
            else if (s.header.fallbackReason)
                adaptations.push({ kind: 'maximum-header-space-fallback', sectionId: s.sectionId, reason: s.header.fallbackReason, nativeTopTwips: s.nativeMarginTwips.top });
        }
        const receipt: DocxReceipt = freeze({ mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sha256: hash(bytes), bytes: bytes.length, sourceDigest: intent.sourceDigest, profileId: intent.profileId, fieldRefresh: 'required', wordVerified: false, resources: intent.resourceIdentities, autoFormats: intent.document.formatInstances ?? [], sections: built.receipts, bookmarks: built.anchors, numbering: { leadingExcludedSections: built.leadingExcluded, fieldDigitEnvelope: fieldDigitBudget(intent) }, adaptations, buffered: true });
        cancelled(options);
        await sink.write(Uint8Array.from(bytes));
        cancelled(options);
        await sink.commit(receipt, options.signal);
        return { ok: true, value: receipt, warnings: [] };
    }
    catch (e) {
        return cleanup(sink, e);
    }
}
export async function generateDocxTo(document: Readonly<ResolvedDocument>, resources: ResourceSnapshot, sink: DocxSink, options: WriteOptions = {}): Promise<Result<DocxReceipt>> { try {
    cancelled(options);
    const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
    if (major !== 24 || minor < 15)
        fail('DOCX_CAPABILITY_UNSUPPORTED', 'runtime.node', 'Pinned writer requires Node >=24.15.0 <25');
    const p = take(preflightDocx(document, resources, options.profile ?? defaultProfile)), i = take(deriveExportIntent(p));
    return writeDocx(i, sink, options);
}
catch (e) {
    return cleanup(sink, e);
} }
