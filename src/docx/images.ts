import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';
import { snapshotImageProvider, verifiedImageStream, type PdfImageProvider, type StreamPdfImage } from '../pdf/streamResources.js';
import type { ResolvedDocument, ResourceImage } from './types.js';
import { defaultProfile } from './profile.js';
const PNG = createRequire(import.meta.url)('pngjs').PNG;
import { required } from './types.js';
import { Paragraph, Run, XmlComponent, BuilderElement, docPropertiesUniqueNumericId, createTransformation, LineRuleType, type IContext } from 'docx';
import { capture, fail, type ExportIntent, type Result } from './types.js';
import { requireGenuineIntent, intentResourceBytes } from './profile.js';
import { toTwips } from './units.js';
import { hash } from './resources.js';
import { sourceGraph } from './fields.js';
const el = (name: string, attrs: Record<string, string | number> = {}, children: XmlComponent[] = []) => new BuilderElement({ name, attributes: Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, { key, value }])), children });
interface Picture {
    widthEmu: number;
    heightEmu: number;
    xEmu: number;
    yEmu: number;
}
// Build a native inline drawing from verified PNG bytes; never edit an old package.
class ContainedImageRun extends Run {
    private readonly fileName: string;
    constructor(private readonly bytes: Uint8Array, private readonly width: number, private readonly height: number, picture: Picture, private readonly kind: 'png' | 'jpg') {
        super({ size: 2, sizeComplexScript: 2, bold: false, italics: false, snapToGrid: false });
        this.fileName = hash(bytes) + '.' + kind;
        const id = docPropertiesUniqueNumericId(), name = kind === 'png' ? 'Verified PNG' : 'Verified JPEG';
        const graphic = el('a:graphic', { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main' }, [
            el('a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' }, [
                el('pic:pic', { 'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture' }, [
                    el('pic:nvPicPr', {}, [el('pic:cNvPr', { id: 0, name }), el('pic:cNvPicPr', {}, [el('a:picLocks', { noChangeAspect: 1 })])]),
                    el('pic:blipFill', {}, [el('a:blip', { 'r:embed': `rId{${this.fileName}}` }), el('a:stretch', {}, [el('a:fillRect')])]),
                    el('pic:spPr', {}, [el('a:xfrm', {}, [el('a:off', { x: picture.xEmu, y: picture.yEmu }), el('a:ext', { cx: picture.widthEmu, cy: picture.heightEmu })]), el('a:prstGeom', { prst: 'rect' }, [el('a:avLst')])])
                ])
            ])
        ]);
        this.root.push(el('w:drawing', {}, [el('wp:inline', { distT: 0, distB: 0, distL: 0, distR: 0 }, [
                el('wp:extent', { cx: width, cy: height }), el('wp:effectExtent', { l: 0, t: 0, r: 0, b: 0 }), el('wp:docPr', { id, name }), el('wp:cNvGraphicFramePr', {}, [el('a:graphicFrameLocks', { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main', noChangeAspect: 1 })]), graphic
            ])]));
    }
    prepForXml(context: IContext) { context.file.Media.addImage(this.fileName, { type: this.kind, fileName: this.fileName, data: this.bytes, transformation: createTransformation({ width: this.width / 9525, height: this.height / 9525 }) }); return super.prepForXml(context); }
}
export function buildImageParagraph(intent: ExportIntent, nodeId: string, scope = "nodes"): Result<{
    paragraph: Paragraph;
    receipt: {
        nodeId: string;
        resourceId: string;
        sha256: string;
        frame: {
            widthTwips: number;
            heightTwips: number;
        };
        picture: Picture;
        wrapper: {
            kind: string;
            paragraphMarkSizeHalfPoints: number;
            minimumLineTwips: number;
            wordFootprintVerified: false;
        };
        visualVerified: false;
    };
}> {
    return capture(() => {
        requireGenuineIntent(intent);
        const source: any = sourceGraph(intent, scope)[nodeId], path = scope + '.' + nodeId;
        if (source?.type !== 'image')
            fail('DOCX_CAPABILITY_UNSUPPORTED', path, 'U2 requires a body image node', nodeId);
        const meta: any = intent.resourceIdentities.find((r: any) => r.id === source.props.resourceId && r.width !== undefined);
        if (!meta)
            fail('DOCX_RESOURCE_INVALID', path + '.props.resourceId', 'Verified image metadata missing', nodeId);
        const widthTwips = toTwips(source.props.width, path + '.props.width'), heightTwips = toTwips(source.props.height, path + '.props.height');
        if (widthTwips < 1 || heightTwips < 1)
            fail('DOCX_GEOMETRY_UNREPRESENTABLE', path, 'Image frame quantizes to zero', nodeId);
        const fw = widthTwips * 635, fh = heightTwips * 635, ratio = Math.min(fw / meta.width, fh / meta.height), w = Math.round(meta.width * ratio), h = Math.round(meta.height * ratio);
        const picture = { widthEmu: w, heightEmu: h, xEmu: Math.round((fw - w) / 2), yEmu: Math.round((fh - h) / 2) };
        const bytes = intentResourceBytes(intent, 'image', meta.id);
        const paragraph = new Paragraph({ children: [new ContainedImageRun(bytes, fw, fh, picture, meta.kind === 'jpeg' ? 'jpg' : 'png')], run: { size: 2, sizeComplexScript: 2, bold: false, italics: false }, alignment: source.props.align ?? 'left', spacing: { before: 0, after: 0, line: heightTwips, lineRule: LineRuleType.AT_LEAST } });
        return { paragraph, receipt: { nodeId, resourceId: meta.id, sha256: meta.sha256, frame: { widthTwips, heightTwips }, picture, wrapper: { kind: 'native-inline-drawing-paragraph', paragraphMarkSizeHalfPoints: 2, minimumLineTwips: heightTwips, wordFootprintVerified: false }, visualVerified: false } };
    });
}
/** All metadata/budgets are checked before opening the first referenced stream. */
export async function prepareDocxImages(document: ResolvedDocument, input: PdfImageProvider, fontBytes: number, signal?: AbortSignal): Promise<ResourceImage[]> {
    const graphs = [document.nodes, ...(document.sections ?? []).flatMap(s => [s.header, s.footer]).filter(b => b !== undefined).map(b => b.nodes)];
    const ids = new Set(graphs.flatMap(g => Object.values(g).filter(n => n.type === 'image').map(n => n.props.resourceId)));
    let provider: PdfImageProvider;
    try {
        provider = snapshotImageProvider(input);
    }
    catch {
        fail('DOCX_RESOURCE_INVALID', 'images', 'Invalid prepared image provider');
    }
    let declared = fontBytes;
    for (const id of ids) {
        const m = provider.images[id];
        if (!m)
            fail('DOCX_RESOURCE_INVALID', 'images.' + id, 'Missing prepared image');
        if (m.width * m.height > defaultProfile.limits.maxImagePixels)
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'images.' + id, 'Image pixel budget exceeded');
        declared += m.content.byteLength + (m.alpha?.byteLength ?? 0);
        if (declared > defaultProfile.limits.maxResourceBytes)
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'images.' + id, 'Aggregate resource budget exceeded');
    }
    const result: ResourceImage[] = [];
    let encoded = fontBytes;
    async function stream(image: StreamPdfImage, alpha: boolean) {
        const chunks: Buffer[] = [];
        for await (const chunk of verifiedImageStream(provider, image, alpha, signal))
            chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks);
    }
    for (const id of ids) {
        if (signal?.aborted)
            fail('DOCX_CANCELLED', 'options.signal', 'Export cancelled');
        const image = required(provider.images[id], 'images.' + id);
        let bytes: Buffer;
        try {
            const content = await stream(image, false);
            if (image.kind === 'jpeg')
                bytes = content;
            else {
                const pixels = image.width * image.height, rgb = inflateSync(content, { maxOutputLength: pixels * 3 });
                const alpha = image.alpha ? inflateSync(await stream(image, true), { maxOutputLength: pixels }) : undefined;
                const rgba = Buffer.alloc(pixels * 4);
                for (let i = 0; i < pixels; i++) {
                    rgba[i * 4] = rgb[i * 3]!;
                    rgba[i * 4 + 1] = rgb[i * 3 + 1]!;
                    rgba[i * 4 + 2] = rgb[i * 3 + 2]!;
                    rgba[i * 4 + 3] = alpha ? alpha[i]! : 255;
                }
                bytes = PNG.sync.write({ width: image.width, height: image.height, data: rgba }, { colorType: 6 });
            }
        }
        catch (error) {
            if (signal?.aborted)
                fail('DOCX_CANCELLED', 'options.signal', 'Export cancelled');
            fail('DOCX_RESOURCE_INVALID', 'images.' + id, error instanceof Error ? error.message : 'Invalid prepared image stream');
        }
        encoded += bytes.length;
        if (encoded > defaultProfile.limits.maxResourceBytes)
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', 'images.' + id, 'Encoded resource budget exceeded');
        result.push({ id, bytes, sha256: hash(bytes), kind: image.kind === 'jpeg' ? 'jpeg' : 'png', width: image.width, height: image.height });
    }
    return result;
}
