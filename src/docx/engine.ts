import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { ExportResources } from '../runtime/exportResources.js';
import type { PdfImageProvider } from '../pdf/streamResources.js';
import type { ResolvedDocument } from '../composition/resolvedDocument.js';
import { validateResolvedDocument } from '../composition/validateResolvedDocument.js';
import { validateFontIdentities } from '../fonts/resources.js';
import { selectFont } from '../fonts/selection.js';
import { FontError } from '../fonts/types.js';
import { generateDocxTo, type DocxReceipt } from './writer.js';
import { defaultProfile } from './profile.js';
import { hash, snapshotResources } from './resources.js';
import { MappingError, fail, type ResourceFont, type ResourceSnapshot, type Result, type Issue } from './types.js';
export type PreparedImageProvider = PdfImageProvider;
export type DocxResources = Pick<ExportResources, 'fonts'>;
export interface DocxOptions {
    signal?: AbortSignal;
    maxBytes?: number;
}
export interface DocxOutput {
    write(bytes: Uint8Array): Promise<void>;
    abort(reasonCode: string): Promise<void>;
}
export interface DocxArtifact {
    mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    byteLength: number;
    sha256: string;
    pageCount: null;
    fieldRefresh: 'required';
    wordVerified: false;
    buffered: true;
    adaptations: readonly unknown[];
}
export interface DocxEngine {
    generateDocxTo(document: ResolvedDocument, images: PreparedImageProvider, output: DocxOutput, options?: DocxOptions): Promise<Result<DocxArtifact>>;
}
function issue(error: unknown): Issue {
    if (error instanceof MappingError)
        return error.issue;
    if (error instanceof FontError)
        return { code: error.code, path: error.path, message: error.message };
    return { code: 'DOCX_RESOURCE_INVALID', path: 'resources', message: error instanceof Error ? error.message : 'Invalid DOCX resources' };
}
/** Uses Core font identities and verified owned bytes. Prepared image conversion is the next integration slice. */
export async function createDocxEngine(input: DocxResources): Promise<Result<DocxEngine>> {
    try {
        const resources = structuredClone(input);
        validateFontIdentities(resources.fonts);
        let total = 0;
        async function owned(path: string, expected: string, license = false) {
            if (!isAbsolute(path) || !/^[a-f0-9]{64}$/.test(expected))
                fail('DOCX_RESOURCE_INVALID', 'resources.fonts', 'Invalid resource path or hash');
            const size = (await stat(path)).size;
            if (size > (license ? 1024 * 1024 : 10 * 1024 * 1024) || total + size > defaultProfile.limits.maxResourceBytes)
                fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'resources.fonts', 'Font resource budget exceeded');
            const bytes = await readFile(path);
            total += bytes.length;
            if (total > defaultProfile.limits.maxResourceBytes)
                fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'resources.fonts', 'Font resource budget exceeded');
            if (hash(bytes) !== expected)
                fail(license ? 'FONT_LICENSE_HASH_MISMATCH' : 'FONT_ASSET_HASH_MISMATCH', 'resources.fonts', 'Resource hash mismatch');
            if (license) {
                let text: string;
                try {
                    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                }
                catch {
                    fail('FONT_LICENSE_UNAVAILABLE', 'resources.fonts', 'Invalid UTF-8 license');
                }
                if (!text.trim() || text.includes('\u0000'))
                    fail('FONT_LICENSE_UNAVAILABLE', 'resources.fonts', 'Invalid license evidence');
            }
            return Uint8Array.from(bytes);
        }
        const fonts: ResourceFont[] = [];
        const aliases = { 'font-regular': 'regular', 'font-bold': 'bold', 'font-italic': 'italic', 'font-bold-italic': 'boldItalic' } as const;
        for (const f of resources.fonts) {
            const bytes = await owned(f.path, f.sha256);
            if (!f.licenses?.length)
                fail('FONT_LICENSE_UNAVAILABLE', 'resources.fonts', 'Verified license evidence is required');
            const licenses = [];
            for (const l of f.licenses)
                licenses.push({ bytes: await owned(l.path, l.sha256, true), sha256: l.sha256 });
            const license = licenses[0];
            if (!license)
                fail('FONT_LICENSE_UNAVAILABLE', 'resources.fonts', 'No license');
            const alias = aliases[f.id as keyof typeof aliases];
            fonts.push({ id: f.id, bytes, sha256: f.sha256, license,
                ...(f.selection ? { releaseId: f.selection.releaseId, weight: f.selection.weight, style: f.selection.style } :
                    { legacyAlias: alias, weight: alias === 'bold' || alias === 'boldItalic' ? 700 : 400, style: alias === 'italic' || alias === 'boldItalic' ? 'italic' as const : 'normal' as const }) });
        }
        const snapshot: ResourceSnapshot = { fonts, images: [] };
        snapshotResources(snapshot, defaultProfile);
        const engine: DocxEngine = { async generateDocxTo(document, images, output, options = {}) {
                try {
                    if (!output || typeof output.write !== 'function' || typeof output.abort !== 'function')
                        fail('DOCX_INPUT_INVALID', 'output', 'A staged write/abort output is required');
                    if (!options || Object.keys(options).some(k => !['signal', 'maxBytes'].includes(k)))
                        fail('DOCX_INPUT_INVALID', 'options', 'Unknown DOCX options');
                    const issues = validateResolvedDocument(document);
                    if (issues.length) {
                        await output.abort(issues[0]?.code ?? 'DOCX_INPUT_INVALID');
                        return { ok: false, issues, warnings: [] };
                    }
                    for (const style of Object.values(document.styles))
                        selectFont(style, resources.fonts);
                    if (!images || images.contract !== 'flowdoc-pdf-stream/1' || typeof images.open !== 'function' || !images.images)
                        fail('DOCX_INPUT_INVALID', 'images', 'Expected Core prepared image provider');
                    const bands = document.sections?.flatMap(s => [s.header, s.footer]).filter(b => b !== undefined) ?? [];
                    if ([...Object.values(document.nodes), ...bands.flatMap(b => Object.values(b.nodes))].some(n => n.type === 'image'))
                        fail('DOCX_CAPABILITY_UNSUPPORTED', 'images', 'Prepared image bridge is not implemented in this integration slice');
                    let receipt: DocxReceipt | undefined;
                    const result = await generateDocxTo(document, snapshot, {
                        async write(bytes) { for (let at = 0; at < bytes.length; at += 65536) {
                            if (options.signal?.aborted)
                                fail('DOCX_CANCELLED', 'options.signal', 'Export cancelled');
                            await output.write(bytes.slice(at, at + 65536));
                        } },
                        async commit(value) { receipt = value; },
                        async abort(reason) { await output.abort(issue(reason).code); }
                    }, { ...(options.signal ? { signal: options.signal } : {}), ...(options.maxBytes !== undefined ? { maxOutputBytes: options.maxBytes } : {}) });
                    if (!result.ok)
                        return result;
                    if (!receipt)
                        fail('DOCX_SERIALIZATION_FAILED', 'output', 'Missing staged receipt');
                    return { ok: true, value: { mediaType: receipt.mediaType, byteLength: receipt.bytes, sha256: receipt.sha256, pageCount: null, fieldRefresh: 'required', wordVerified: false, buffered: true, adaptations: receipt.adaptations }, warnings: result.warnings };
                }
                catch (error) {
                    const found = issue(error), issues = [found];
                    try {
                        await output?.abort(found.code);
                    }
                    catch {
                        issues.push({ code: 'DOCX_CLEANUP_FAILED', path: 'output.abort', message: 'Output cleanup failed' });
                    }
                    return { ok: false, issues, warnings: [] };
                }
            } };
        return { ok: true, value: engine, warnings: [] };
    }
    catch (error) {
        return { ok: false, issues: [issue(error)], warnings: [] };
    }
}
