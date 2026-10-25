export { loadBundledResources } from './runtime/loadBundledResources.js';
export {loadLibraryFonts} from './fonts/resources.js';
export {selectFont} from './fonts/selection.js';
export {calculateFontHeightAdjustment,FONT_HEIGHT_METHOD} from './fonts/heightAdjustment.js';
export type {FontHeightAdjustmentMetric,FontHeightAdjustmentInput,FontHeightAdjustmentResult,FontHeightAdjustmentErrorCode} from './fonts/heightAdjustment.js';
export type {FontSelection,LibraryTextStyle,LibraryFontInput,FontLicense} from './fonts/types.js';
export {createPdfEngine} from './pdf/createPdfEngine.js';
export {createDocxEngine} from './docx/engine.js';
export type {DocxEngine,DocxResources,DocxOptions,DocxOutput,DocxArtifact,PreparedImageProvider} from './docx/engine.js';
export type {PdfEngine,PdfArtifact,PdfStreamArtifact,PdfOutput} from './pdf/createPdfEngine.js';
export {PDF_STREAM_CONTRACT} from './pdf/streamResources.js';
export type {PdfImageProvider,PdfStreamRef,StreamPdfImage} from './pdf/streamResources.js';
export type {PdfStreamOptions} from './pdf/writePdfTo.js';
export type {ResolvedDocument,TextBlock,TextInline,TextStyle,SourceEntry,Length} from './composition/resolvedDocument.js';
export type { ExportResources, ResourceOptions, FontResource } from './runtime/exportResources.js';
export type { Result, Issue } from './result.js';
export {validateTemplate} from './template/validateTemplate.js';
export {prepareGeneration} from './data/prepareGeneration.js';
export {composeDocument} from './composition/composeDocument.js';
export {composeTaskDocument} from './composition/composeTaskDocument.js';
export type {TemplateDefinition,ValidatedTemplate,Format,Fragment,Repeat,CellRepeat,ObjectSchema,StringField,ImageField,TemplateImageBlock,ArrayField,FieldRef,TemplateNode} from './template/types.js';
export type {PreparedInput,PreparedData} from './data/types.js';
export type {DocumentNode,PageBreak,Table,TableRow,TableCell} from './composition/resolvedDocument.js';
export type {ImageBlock} from './composition/resolvedDocument.js';
export type {PreparedPdfImage,PdfImageResources} from './pdf/imageResources.js';

export type {BoundLink} from './composition/linkContract.js';
export type {LinkField,ScalarBinding,TemplateLink,TemplateInline} from './template/types.js';

export type {ContentsBlock,ContentsScope} from './composition/resolvedDocument.js';

export {readGenerationJson} from './data/readGenerationJson.js';
export type {AreaField,AreaEntry,AreaFormat,TemplateArea} from './template/types.js';

export type {PreparedSection} from './data/types.js';

export type {SystemPageField} from "./composition/resolvedDocument.js";

export type {ResolvedRowGroup,ResolvedGroupLabel} from './composition/resolvedDocument.js';

export type {Template18,Template19,InstanceSection,AreaSection,BindingScope,PageNumbering,RowGroup,GroupLabel} from './template/types.js';
export type {PreparedSection19} from './data/types.js';
export {normalizeTaskInput} from './data/taskInput.js';
export type {TaskValue,TaskImageContext,TaskImageResource,TaskInputOptions,TaskInputLimits,TaskInputSummary} from './data/taskInput.js';
