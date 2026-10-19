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
import {writePdfTo} from './writePdfTo.js';
import type {PdfStreamSink,PdfStreamOptions,PdfWriteReceipt} from './writePdfTo.js';
import {snapshotImageProvider} from './streamResources.js';
import type {PdfImageMetadata,PdfImageProvider} from './streamResources.js';
export interface PdfArtifact {
    bytes: Uint8Array;
    mediaType: 'application/pdf';
    pageCount: number;
    fontUsage?:{fontId:string;sha256:string;selection?:import('../runtime/exportResources.js').FontResource['selection'];licenses:{id:string;sha256:string}[]}[];
}
export interface PdfEngine {
    generatePdf(document: ResolvedDocument, images?: PdfImageResources): Promise<Result<PdfArtifact>>;
    generatePdfTo(document:ResolvedDocument,images:PdfImageProvider,output:PdfOutput,options?:PdfStreamOptions):Promise<Result<PdfStreamArtifact>>;
}
export interface PdfOutput extends PdfStreamSink {abort(reasonCode:string):Promise<void>}
export interface PdfStreamArtifact extends PdfWriteReceipt {mediaType:'application/pdf';pageCount:number;fontUsage?:PdfArtifact['fontUsage']}
interface Dependencies {
    runtime: TextRuntime | ((resources:ExportResources) => TextRuntime & {
        close(): Promise<void>;
    });
    subset: typeof subsetFonts;
    write: typeof writePdf;
}
const fail = (code: string, message: string): Result<never> => ({ ok: false, issues: [{ code, path: 'document', message }], warnings: [] });
export function createEngine(resources: ExportResources, deps: Dependencies): PdfEngine {
    type Streaming={provider:PdfImageProvider;output:PdfStreamSink;options:PdfStreamOptions};
    const generate=async(input:ResolvedDocument,imageInput:PdfImageResources={},streaming?:Streaming):Promise<Result<PdfArtifact|PdfStreamArtifact>>=>{
            if(streaming&&input&&typeof input==='object'){
                let count=0;
                for(const nodes of [input.nodes,input.header?.nodes,input.footer?.nodes,...(input.sections??[]).flatMap(s=>[s.header?.nodes,s.footer?.nodes])]){
                    if(!nodes||typeof nodes!=='object')continue;
                    for(const node of Object.values(nodes)){count+=1+(node?.type==='text-block'&&Array.isArray(node.children)?node.children.length:0);if(count>50000)return fail('TASK_COMPOSITION_LIMIT','Task document exceeds the expanded node limit');}
                }
            }
            const issues = validateResolvedDocument(input);
            if (issues.length)
                return { ok: false, issues, warnings: [] };
            // Snapshot before the first await so caller mutation cannot change a running job.
            const document = structuredClone(input);
            let images: PdfImageMetadata,legacyImages:PdfImageResources={};
            let provider:PdfImageProvider|undefined;
            try {
                if(streaming){provider=snapshotImageProvider(streaming.provider);images=Object.fromEntries(Object.entries(provider.images).map(([id,i])=>[id,{width:i.width,height:i.height}]));}
                else{validateImageResources(imageInput);legacyImages=snapshotImageResources(imageInput);images=legacyImages;}
            }
            catch {
                return fail('INVALID_IMAGE_RESOURCE', 'Prepared image resources are invalid or exceed the memory budget');
            }
            const warnings: Issue[] = [...Object.values(document.nodes), ...Object.values(document.header?.nodes ?? {}), ...Object.values(document.footer?.nodes ?? {}), ...(document.sections ?? []).flatMap(s => [...Object.values(s.header?.nodes ?? {}), ...Object.values(s.footer?.nodes ?? {})])].filter(n => n.type === 'image' && !Object.hasOwn(images, n.props.resourceId)).map(n => ({ code: 'IMAGE_UNAVAILABLE', path: 'nodes.' + n.id, nodeId: n.id, message: 'Image unavailable; authored frame retained' }));
            let temp: string | undefined, result: Result<PdfArtifact|PdfStreamArtifact>, stage = 'resource';
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
                streaming?.options.signal?.throwIfAborted();
                const draw = await documentFlow(document, runtime, images,streaming?{maxPages:2000,maxImagePlacements:10000,signal:streaming.options.signal}:undefined);
                warnings.push(...draw.warnings ?? []);
                const anchors = indexDestinations(document, draw);
                await fillContentsNumbers(draw, anchors, runtime, true);
                await fillPageFields(draw, runtime);

                // Page fields are the last text-runtime consumer; avoid retaining layout cache during PDF output.
                runtime.dispose();
                resolveLinkGeometry(document, draw, anchors);
                const fonts = await deps.subset(draw, current, temp);
                stage = 'writer';
                const output=streaming?await writePdfTo(draw,fonts,provider!,streaming.output,streaming.options):{bytes:deps.write(draw,fonts,legacyImages)};
                const used=new Set(draw.pages.flatMap(p=>p.commands.map(c=>c.fontId)));
                result = { ok: true, value: { ...output, mediaType: 'application/pdf', pageCount: draw.pages.length,...(document.schemaVersion===2?{fontUsage:current.fonts.filter(f=>used.has(f.id)).map(f=>({fontId:f.id,sha256:f.sha256,...(f.selection?{selection:f.selection}:{}),licenses:(f.licenses??[]).map(l=>({id:l.id,sha256:l.sha256}))}))}:{}) }, warnings };
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
        };
    return {
        generatePdf:(input,images)=>generate(input,images) as Promise<Result<PdfArtifact>>,
        async generatePdfTo(input,provider,output,options={}){
            // Bind callbacks/options before the first await, just like input bytes.
            const write=output.write.bind(output),abort=output.abort.bind(output);
            const pinnedOptions:PdfStreamOptions={...(options.signal?{signal:options.signal}:{}),...(options.maxBytes!==undefined?{maxBytes:options.maxBytes}:{})};
            let result:Result<PdfStreamArtifact>;
            try{result=await generate(input,{}, {provider,output:{write},options:pinnedOptions}) as Result<PdfStreamArtifact>;}catch{result=fail('PDF_RENDER_FAILED','PDF generation failed');}
            if(!result.ok){try{await abort(result.issues[0]?.code??'PDF_RENDER_FAILED');}catch{return fail('PDF_OUTPUT_CLEANUP_FAILED','Partial output cleanup failed');}}
            return result;
        }
    };
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
