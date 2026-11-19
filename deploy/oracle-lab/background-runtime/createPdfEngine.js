import {addPdfSectionBackground} from '/lab/background-runtime/section-background.mjs';
import { cacheTextRuntime } from '../runtime/cacheTextRuntime.js';
import { snapshotFonts, validateFontIdentities } from '../fonts/resources.js';
import { selectFont } from '../fonts/selection.js';
import { FontError } from '../fonts/types.js';
import { fillPageFields } from '../layout/fillPageFields.js';
import { fillContentsNumbers } from '../layout/fillContentsNumbers.js';
import { indexDestinations, resolveLinkGeometry } from '../layout/linkGeometry.js';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { validateResolvedDocument } from '../composition/validateResolvedDocument.js';
import { probeRuntime } from '../runtime/probeRuntime.js';
import { createTextRuntime } from '../runtime/textRuntime.js';
import { subsetFonts } from '../runtime/subsetFonts.js';
import { LayoutError } from '../layout/textFlow.js';
import { documentFlow } from '../layout/documentFlow.js';
import { writePdf } from './writePdf.js';
import { validateImageResources, snapshotImageResources } from './imageResources.js';
import { writePdfTo } from './writePdfTo.js';
import { snapshotImageProvider } from './streamResources.js';
const fail = (code, message) => ({ ok: false, issues: [{ code, path: 'document', message }], warnings: [] });
export function createEngine(resources, deps) {
    const generate = async (input, imageInput = {}, streaming) => {
        if (streaming && input && typeof input === 'object') {
            let count = 0;
            for (const nodes of [input.nodes, ...(input.sections ?? []).flatMap(s => [s.header?.nodes, s.footer?.nodes])]) {
                if (!nodes || typeof nodes !== 'object')
                    continue;
                for (const node of Object.values(nodes)) {
                    count += 1 + (node?.type === 'text-block' && Array.isArray(node.children) ? node.children.length : 0);
                    if (count > 50000)
                        return fail('TASK_COMPOSITION_LIMIT', 'Task document exceeds the expanded node limit');
                }
            }
        }
        const issues = validateResolvedDocument(input);
        if (issues.length)
            return { ok: false, issues, warnings: [] };
        // Snapshot before the first await so caller mutation cannot change a running job.
        const document = structuredClone(input);
        let images, legacyImages = {};
        let provider;
        try {
            if (streaming) {
                provider = snapshotImageProvider(streaming.provider);
                images = Object.fromEntries(Object.entries(provider.images).map(([id, i]) => [id, { width: i.width, height: i.height }]));
            }
            else {
                validateImageResources(imageInput);
                legacyImages = snapshotImageResources(imageInput);
                images = legacyImages;
            }
        }
        catch {
            return fail('INVALID_IMAGE_RESOURCE', 'Prepared image resources are invalid or exceed the memory budget');
        }
        const warnings = [...Object.values(document.nodes), ...(document.sections ?? []).flatMap(s => [...Object.values(s.header?.nodes ?? {}), ...Object.values(s.footer?.nodes ?? {})])].filter(n => n.type === 'image' && !Object.hasOwn(images, n.props.resourceId)).map(n => ({ code: 'IMAGE_UNAVAILABLE', path: 'nodes.' + n.id, nodeId: n.id, message: 'Image unavailable; authored frame retained' }));
        let temp, result, stage = 'resource';
        let session;
        let runtime;
        try {
            if (document.schemaVersion === 2)
                for (const [id, style] of Object.entries(document.styles)) {
                    try {
                        selectFont(style, resources.fonts);
                    }
                    catch (error) {
                        if (error instanceof FontError)
                            throw new FontError(error.code, '/styles/' + id.replaceAll('~', '~0').replaceAll('/', '~1') + '/font');
                        throw error;
                    }
                }
            temp = await mkdtemp(join(resources.tempRoot, 'flowdoc-pdf-'));
            const current = await snapshotFonts(resources, temp);
            if (typeof deps.runtime === 'function')
                session = deps.runtime(current, streaming?.options.signal);
            runtime = cacheTextRuntime(session ?? deps.runtime);
            streaming?.options.signal?.throwIfAborted();
            const draw = await documentFlow(document, runtime, images, streaming ? { maxPages: 2000, maxImagePlacements: 10000, signal: streaming.options.signal } : undefined);
            warnings.push(...draw.warnings ?? []);
            const anchors = indexDestinations(document, draw);
            await fillContentsNumbers(draw, anchors, runtime, true);
            await fillPageFields(draw, runtime);
            // Page fields are the last text-runtime consumer; avoid retaining layout cache during PDF output.
            runtime.dispose();
            if (session) {
                await session.close();
                session = undefined;
            }
            resolveLinkGeometry(document, draw, anchors);
            const fonts = await deps.subset(draw, current, temp);
            stage = 'writer';
            const painted = await addPdfSectionBackground(document, draw, streaming ? provider : undefined, legacyImages); const output = streaming ? await writePdfTo(draw, fonts, painted.provider, streaming.output, streaming.options) : { bytes: deps.write(draw, fonts, painted.legacyImages) };
            const used = new Set(draw.pages.flatMap(p => p.commands.map(c => c.fontId)));
            result = { ok: true, value: { ...output, mediaType: 'application/pdf', pageCount: draw.pages.length, ...(document.schemaVersion === 2 ? { fontUsage: current.fonts.filter(f => used.has(f.id)).map(f => ({ fontId: f.id, sha256: f.sha256, ...(f.selection ? { selection: f.selection } : {}), licenses: (f.licenses ?? []).map(l => ({ id: l.id, sha256: l.sha256 })) })) } : {}) }, warnings };
        }
        catch (error) {
            if (error instanceof FontError)
                result = { ok: false, issues: [{ code: error.code, path: error.path, message: error.message }], warnings: [] };
            else if (error instanceof LayoutError) {
                const source = document.sourceMap[error.nodeId];
                result = { ok: false, issues: [{ code: 'LAYOUT_FAILED', path: error.path ?? 'nodes.' + error.nodeId, ...(error.sectionId ? { sectionId: error.sectionId } : {}), ...(error.reason ? { reason: error.reason } : {}), ...(source?.groupId ? { groupId: source.groupId, groupIndex: source.groupIndex } : {}), nodeId: error.nodeId, message: error.message, ...(source?.origin === 'authored' ? { sectionId: source.sectionId } : source ? { contentIndex: source.contentIndex, format: source.format, ...(source.sectionId ? { sectionId: source.sectionId } : {}) } : {}) }], warnings: document.formatInstances ? [...warnings, ...(error.warnings ?? [])] : [] };
            }
            else
                result = fail(stage === 'writer' ? 'PDF_RENDER_FAILED' : 'RESOURCE_UNAVAILABLE', stage === 'writer' ? 'PDF writing failed' : 'Text or font runtime failed');
        }
        finally {
            runtime?.dispose();
            if (session)
                try {
                    await session.close();
                }
                catch {
                    const cleanup = fail('RESOURCE_UNAVAILABLE', 'Text runtime cleanup failed');
                    result = result && !result.ok && !cleanup.ok ? { ...result, issues: [...result.issues, ...cleanup.issues] } : cleanup;
                }
            if (temp)
                try {
                    await rm(temp, { recursive: true, force: true });
                }
                catch {
                    const cleanup = fail('RESOURCE_UNAVAILABLE', 'Temporary output cleanup failed');
                    result = result && !result.ok && !cleanup.ok ? { ...result, issues: [...result.issues, ...cleanup.issues] } : cleanup;
                }
        }
        return result;
    };
    return {
        generatePdf: (input, images) => generate(input, images),
        async generatePdfTo(input, provider, output, options = {}) {
            // Bind callbacks/options before the first await, just like input bytes.
            const write = output.write.bind(output), abort = output.abort.bind(output);
            const pinnedOptions = { ...(options.signal ? { signal: options.signal } : {}), ...(options.maxBytes !== undefined ? { maxBytes: options.maxBytes } : {}) };
            let result;
            try {
                result = await generate(input, {}, { provider, output: { write }, options: pinnedOptions });
            }
            catch {
                result = fail('PDF_RENDER_FAILED', 'PDF generation failed');
            }
            if (!result.ok) {
                try {
                    await abort(result.issues[0]?.code ?? 'PDF_RENDER_FAILED');
                }
                catch {
                    return fail('PDF_OUTPUT_CLEANUP_FAILED', 'Partial output cleanup failed');
                }
            }
            return result;
        }
    };
}
export async function createPdfEngine(resources) {
    try {
        const snapshot = structuredClone(resources);
        validateFontIdentities(snapshot.fonts);
        if (!snapshot.fonts.length)
            throw Error('Invalid font set');
        for (const font of snapshot.fonts)
            if (createHash('sha256').update(await readFile(font.path)).digest('hex') !== font.sha256)
                throw Error('Changed font');
        await access(snapshot.subsetHelperPath, constants.R_OK);
        await access(snapshot.tempRoot, constants.W_OK);
        const versions = await probeRuntime(snapshot);
        if (!versions.python.startsWith('3.11.') || versions.fontTools !== '4.58.2')
            throw Error('Invalid Python');
        return { ok: true, value: createEngine(snapshot, { runtime: (current, signal) => createTextRuntime(current, signal), subset: subsetFonts, write: writePdf }), warnings: [] };
    }
    catch (error) {
        if (error instanceof FontError)
            return { ok: false, issues: [{ code: error.code, path: error.path, message: error.message }], warnings: [] };
        return fail('RESOURCE_UNAVAILABLE', 'PDF engine resources are unavailable or incompatible');
    }
}
