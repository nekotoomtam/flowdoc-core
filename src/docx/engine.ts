import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { ExportResources } from '../runtime/exportResources.js';
import type { PdfImageProvider } from '../pdf/streamResources.js';
import type { ResolvedDocument } from '../composition/resolvedDocument.js';
import { validateResolvedDocument } from '../composition/validateResolvedDocument.js';
import { validateFontIdentities } from '../fonts/resources.js';
import { selectFont } from '../fonts/selection.js';
import { FontError } from '../fonts/types.js';
import { generateDocxTo } from './writer.js';
import { prepareDocxImages } from './images.js';
import { defaultProfile, snapshotDocxDocument } from './profile.js';
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
function issue(error: unknown, fallback = 'DOCX_RESOURCE_INVALID'): Issue {
    if (error instanceof MappingError)
        return error.issue;
    if (error instanceof FontError)
        return { code: error.code, path: error.path, message: error.message };
    return { code: fallback, path: fallback === 'DOCX_RESOURCE_INVALID' ? 'resources' : 'writer', message: error instanceof Error ? error.message : 'Invalid DOCX resources' };
}
/** Uses Core font identities and verified owned bytes. Prepared images share the verified Core stream contract. */
export async function createDocxEngine(input: DocxResources): Promise<Result<DocxEngine>> {
    try {
        const resources = structuredClone(input);
        validateFontIdentities(resources.fonts);
        let total = 0;
        async function owned(path: string, expected: string, license = false) {
            if (!isAbsolute(path) || !/^[a-f0-9]{64}$/.test(expected))
                fail('DOCX_RESOURCE_INVALID', 'resources.fonts', 'Invalid resource path or hash');
            const handle = await open(path, 'r');
            let bytes: Buffer;
            try {
                const size = (await handle.stat()).size;
                if (!Number.isSafeInteger(size) || size < 1 || size > (license ? 1024 * 1024 : 10 * 1024 * 1024) || total + size > defaultProfile.limits.maxResourceBytes)
                    fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'resources.fonts', 'Font resource budget exceeded');
                bytes = Buffer.alloc(size);
                let at = 0;
                while (at < size) {
                    const { bytesRead } = await handle.read(bytes, at, Math.min(65536, size - at), null);
                    if (!bytesRead)
                        fail('DOCX_RESOURCE_INVALID', 'resources.fonts', 'Truncated font/license resource');
                    at += bytesRead;
                }
                if ((await handle.read(Buffer.alloc(1), 0, 1, null)).bytesRead)
                    fail('DOCX_RESOURCE_INVALID', 'resources.fonts', 'Font/license size changed');
                total += size;
            }
            finally {
                await handle.close();
            }
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
                let abort: ((code: string) => Promise<void>) | undefined;
                try {
                    if (!output || typeof output.write !== 'function' || typeof output.abort !== 'function')
                        fail('DOCX_INPUT_INVALID', 'output', 'A staged write/abort output is required');
                    const write = output.write.bind(output);
                    abort = output.abort.bind(output);
                    if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => !['signal', 'maxBytes'].includes(k)))
                        fail('DOCX_INPUT_INVALID', 'options', 'Invalid DOCX options');
                    const { signal, maxBytes } = options;
                    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 32 * 1024 * 1024))
                        fail('DOCX_INPUT_INVALID', 'options.maxBytes', 'Invalid output budget');
                    if (signal !== undefined && !(signal instanceof AbortSignal))
                        fail('DOCX_INPUT_INVALID', 'options.signal', 'Invalid AbortSignal');
                    if (signal?.aborted)
                        fail('DOCX_CANCELLED', 'options.signal', 'Export cancelled');
                    const pinned = snapshotDocxDocument(document);
                    const issues = validateResolvedDocument(pinned);
                    if (issues.length) {
                        try {
                            await abort(issues[0]?.code ?? 'DOCX_INPUT_INVALID');
                        }
                        catch {
                            issues.push({ code: 'DOCX_CLEANUP_FAILED', path: 'output.abort', message: 'Output cleanup failed' });
                        }
                        return { ok: false, issues, warnings: [] };
                    }
                    const graphs = [pinned.nodes, ...(pinned.sections ?? []).flatMap(s => [s.header, s.footer]).filter(b => b !== undefined).map(b => b.nodes)];
                    if (graphs.reduce((n, g) => n + Object.keys(g).length, 0) > defaultProfile.limits.maxNodes)
                        fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'document.nodes', 'Source node budget exceeded');
                    if (graphs.reduce((n, g) => n + Object.values(g).filter(node => node.type === 'image').length, 0) > 10000)
                        fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'document.nodes', 'Image reference budget exceeded');
                    for (const style of Object.values(pinned.styles))
                        selectFont(style, resources.fonts);
                    const prepared = await prepareDocxImages(pinned, images, total, signal);
                    const result = await generateDocxTo(pinned, { ...snapshot, images: prepared }, {
                        async write(bytes) { for (let at = 0; at < bytes.length; at += 65536) {
                            if (signal?.aborted)
                                fail('DOCX_CANCELLED', 'options.signal', 'Export cancelled');
                            await write(bytes.slice(at, at + 65536));
                        } },
                        async commit() { },
                        async abort(reason) { await abort!(issue(reason, 'DOCX_SERIALIZATION_FAILED').code); }
                    }, { ...(signal ? { signal } : {}), ...(maxBytes !== undefined ? { maxOutputBytes: maxBytes } : {}) });
                    if (!result.ok)
                        return result;
                    const receipt = result.value;
                    return { ok: true, value: { mediaType: receipt.mediaType, byteLength: receipt.bytes, sha256: receipt.sha256, pageCount: null, fieldRefresh: 'required', wordVerified: false, buffered: true, adaptations: receipt.adaptations }, warnings: result.warnings };
                }
                catch (error) {
                    const found = issue(error, 'DOCX_SERIALIZATION_FAILED'), issues = [found];
                    if (abort)
                        try {
                            await abort(found.code);
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
