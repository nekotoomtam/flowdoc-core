import { cacheTextRuntime } from '../runtime/cacheTextRuntime.js';
import {snapshotFonts,validateFontIdentities} from '../fonts/resources.js';
import {selectFont} from '../fonts/selection.js';
import {FontError} from '../fonts/types.js';
import { fillPageFields } from '../layout/fillPageFields.js';
import { fillContentsNumbers } from '../layout/fillContentsNumbers.js';

import { indexDestinations, resolveLinkGeometry } from '../layout/linkGeometry.js';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import type { Result, Issue } from '../result.js';
import type { ResolvedDocument } from '../composition/resolvedDocument.js';
import { validateResolvedDocument } from '../composition/validateResolvedDocument.js';
import type { ExportResources } from '../runtime/exportResources.js';
import { probeRuntime } from '../runtime/probeRuntime.js';
import { createTextRuntime } from '../runtime/textRuntime.js';
import { subsetFonts } from '../runtime/subsetFonts.js';
import { LayoutError } from '../layout/textFlow.js';
import { documentFlow } from '../layout/documentFlow.js';
import type { TextRuntime } from '../layout/textFlow.js';
import { writePdf } from './writePdf.js';
import { validateImageResources, snapshotImageResources } from './imageResources.js';
import type { PdfImageResources } from './imageResources.js';
export interface PdfArtifact {
    bytes: Uint8Array;
    mediaType: 'application/pdf';
    pageCount: number;
    fontUsage?:{fontId:string;sha256:string;selection?:import('../runtime/exportResources.js').FontResource['selection'];licenses:{id:string;sha256:string}[]}[];
}
export interface PdfEngine {
    generatePdf(document: ResolvedDocument, images?: PdfImageResources): Promise<Result<PdfArtifact>>;
}
interface Dependencies {
    runtime: TextRuntime | ((resources:ExportResources) => TextRuntime & {
        close(): Promise<void>;
    });
    subset: typeof subsetFonts;
    write: typeof writePdf;
}
const fail = (code: string, message: string): Result<never> => ({ ok: false, issues: [{ code, path: 'document', message }], warnings: [] });
export function createEngine(resources: ExportResources, deps: Dependencies): PdfEngine {
    return { async generatePdf(input, imageInput = {}) {
            const issues = validateResolvedDocument(input);
            if (issues.length)
                return { ok: false, issues, warnings: [] };
            // Snapshot before the first await so caller mutation cannot change a running job.
            const document = structuredClone(input);
            let images: PdfImageResources;
            try {
                validateImageResources(imageInput);
                images = snapshotImageResources(imageInput);
            }
            catch {
                return fail('INVALID_IMAGE_RESOURCE', 'Prepared image resources are invalid or exceed the memory budget');
            }
            const warnings: Issue[] = [...Object.values(document.nodes), ...Object.values(document.header?.nodes ?? {}), ...Object.values(document.footer?.nodes ?? {}), ...(document.sections ?? []).flatMap(s => [...Object.values(s.header?.nodes ?? {}), ...Object.values(s.footer?.nodes ?? {})])].filter(n => n.type === 'image' && !Object.hasOwn(images, n.props.resourceId)).map(n => ({ code: 'IMAGE_UNAVAILABLE', path: 'nodes.' + n.id, nodeId: n.id, message: 'Image unavailable; authored frame retained' }));
            let temp: string | undefined, result: Result<PdfArtifact>, stage = 'resource';
            let session: (TextRuntime & {
                close(): Promise<void>;
            }) | undefined;
            let runtime: ReturnType<typeof cacheTextRuntime> | undefined;
            try {
                if(document.schemaVersion===2)for(const [id,style] of Object.entries(document.styles)){
                    try{selectFont(style,resources.fonts);}catch(error){if(error instanceof FontError)throw new FontError(error.code,'/styles/'+id.replaceAll('~','~0').replaceAll('/','~1')+'/font');throw error;}
                }
                temp = await mkdtemp(join(resources.tempRoot, 'flowdoc-pdf-'));
                const current=await snapshotFonts(resources,temp);
                if (typeof deps.runtime === 'function')
                    session = deps.runtime(current);
                runtime = cacheTextRuntime(session ?? deps.runtime as TextRuntime);
                const draw = await documentFlow(document, runtime, images);
                warnings.push(...draw.warnings ?? []);
                const anchors = indexDestinations(document, draw);
                await fillContentsNumbers(draw, anchors, runtime, true);
                await fillPageFields(draw, runtime);

                // Page fields are the last text-runtime consumer; avoid retaining layout cache during PDF output.
                runtime.dispose();
                resolveLinkGeometry(document, draw, anchors);
                const fonts = await deps.subset(draw, current, temp);
                stage = 'writer';
                const bytes = deps.write(draw, fonts, images);
                const used=new Set(draw.pages.flatMap(p=>p.commands.map(c=>c.fontId)));
                result = { ok: true, value: { bytes, mediaType: 'application/pdf', pageCount: draw.pages.length,...(document.schemaVersion===2?{fontUsage:current.fonts.filter(f=>used.has(f.id)).map(f=>({fontId:f.id,sha256:f.sha256,...(f.selection?{selection:f.selection}:{}),licenses:(f.licenses??[]).map(l=>({id:l.id,sha256:l.sha256}))}))}:{}) }, warnings };
            }
            catch (error) {
                if(error instanceof FontError)result={ok:false,issues:[{code:error.code,path:error.path,message:error.message}],warnings:[]};
                else if (error instanceof LayoutError) {
                    const source = document.sourceMap[error.nodeId];
                    result = { ok: false, issues: [{ code: 'LAYOUT_FAILED', path: error.path ?? 'nodes.' + error.nodeId, ...(error.sectionId ? { sectionId: error.sectionId } : {}), ...(error.reason?{reason:error.reason}:{}), ...(source?.groupId?{groupId:source.groupId,groupIndex:source.groupIndex}:{}), nodeId: error.nodeId, message: error.message, ...(source?.origin === 'authored' ? { sectionId: source.sectionId } : source ? { contentIndex: source.contentIndex, format: source.format, ...(source.sectionId ? { sectionId: source.sectionId } : {}) } : {}) }], warnings:document.formatInstances?[...warnings,...(error.warnings??[])]:[] };
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
                        result = fail('RESOURCE_UNAVAILABLE', 'Text runtime cleanup failed');
                    }
                if (temp)
                    try {
                        await rm(temp, { recursive: true, force: true });
                    }
                    catch {
                        result = fail('RESOURCE_UNAVAILABLE', 'Temporary output cleanup failed');
                    }
            }
            return result!;
        } };
}
export async function createPdfEngine(resources: ExportResources): Promise<Result<PdfEngine>> {
    try {
        const snapshot = structuredClone(resources);
        validateFontIdentities(snapshot.fonts);
        if(!snapshot.fonts.length)throw Error('Invalid font set');
        for (const font of snapshot.fonts)
            if (createHash('sha256').update(await readFile(font.path)).digest('hex') !== font.sha256)
                throw Error('Changed font');
        await access(snapshot.subsetHelperPath, constants.R_OK);
        await access(snapshot.tempRoot, constants.W_OK);
        const versions = await probeRuntime(snapshot);
        if (!versions.python.startsWith('3.11.') || versions.fontTools !== '4.58.2')
            throw Error('Invalid Python');
        return { ok: true, value: createEngine(snapshot, { runtime: current => createTextRuntime(current), subset: subsetFonts, write: writePdf }), warnings: [] };
    }
    catch(error) {
        if(error instanceof FontError)return {ok:false,issues:[{code:error.code,path:error.path,message:error.message}],warnings:[]};
        return fail('RESOURCE_UNAVAILABLE', 'PDF engine resources are unavailable or incompatible');
    }
}
