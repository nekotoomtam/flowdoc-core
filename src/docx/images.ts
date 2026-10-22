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
class ContainedPngRun extends Run {
    private readonly fileName: string;
    constructor(private readonly bytes: Uint8Array, private readonly width: number, private readonly height: number, picture: Picture) {
        super({ size: 2, sizeComplexScript: 2, bold: false, italics: false, snapToGrid: false });
        this.fileName = hash(bytes) + '.png';
        const id = docPropertiesUniqueNumericId();
        const graphic = el('a:graphic', { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main' }, [
            el('a:graphicData', { uri: 'http://schemas.openxmlformats.org/drawingml/2006/picture' }, [
                el('pic:pic', { 'xmlns:pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture' }, [
                    el('pic:nvPicPr', {}, [el('pic:cNvPr', { id: 0, name: 'Verified PNG' }), el('pic:cNvPicPr', {}, [el('a:picLocks', { noChangeAspect: 1 })])]),
                    el('pic:blipFill', {}, [el('a:blip', { 'r:embed': `rId{${this.fileName}}` }), el('a:stretch', {}, [el('a:fillRect')])]),
                    el('pic:spPr', {}, [el('a:xfrm', {}, [el('a:off', { x: picture.xEmu, y: picture.yEmu }), el('a:ext', { cx: picture.widthEmu, cy: picture.heightEmu })]), el('a:prstGeom', { prst: 'rect' }, [el('a:avLst')])])
                ])
            ])
        ]);
        this.root.push(el('w:drawing', {}, [el('wp:inline', { distT: 0, distB: 0, distL: 0, distR: 0 }, [
                el('wp:extent', { cx: width, cy: height }), el('wp:effectExtent', { l: 0, t: 0, r: 0, b: 0 }), el('wp:docPr', { id, name: 'Verified PNG' }), el('wp:cNvGraphicFramePr', {}, [el('a:graphicFrameLocks', { 'xmlns:a': 'http://schemas.openxmlformats.org/drawingml/2006/main', noChangeAspect: 1 })]), graphic
            ])]));
    }
    prepForXml(context: IContext) { context.file.Media.addImage(this.fileName, { type: 'png', fileName: this.fileName, data: this.bytes, transformation: createTransformation({ width: this.width / 9525, height: this.height / 9525 }) }); return super.prepForXml(context); }
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
            fail('DOCX_RESOURCE_INVALID', path + '.props.resourceId', 'Verified PNG metadata missing', nodeId);
        const widthTwips = toTwips(source.props.width, path + '.props.width'), heightTwips = toTwips(source.props.height, path + '.props.height');
        if (widthTwips < 1 || heightTwips < 1)
            fail('DOCX_GEOMETRY_UNREPRESENTABLE', path, 'Image frame quantizes to zero', nodeId);
        const fw = widthTwips * 635, fh = heightTwips * 635, ratio = Math.min(fw / meta.width, fh / meta.height), w = Math.round(meta.width * ratio), h = Math.round(meta.height * ratio);
        const picture = { widthEmu: w, heightEmu: h, xEmu: Math.round((fw - w) / 2), yEmu: Math.round((fh - h) / 2) };
        const bytes = intentResourceBytes(intent, 'image', meta.id);
        const paragraph = new Paragraph({ children: [new ContainedPngRun(bytes, fw, fh, picture)], run: { size: 2, sizeComplexScript: 2, bold: false, italics: false }, alignment: source.props.align ?? 'left', spacing: { before: 0, after: 0, line: heightTwips, lineRule: LineRuleType.AT_LEAST } });
        return { paragraph, receipt: { nodeId, resourceId: meta.id, sha256: meta.sha256, frame: { widthTwips, heightTwips }, picture, wrapper: { kind: 'native-inline-drawing-paragraph', paragraphMarkSizeHalfPoints: 2, minimumLineTwips: heightTwips, wordFootprintVerified: false }, visualVerified: false } };
    });
}
