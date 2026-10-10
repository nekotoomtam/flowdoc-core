import type {BoundLink} from '../composition/linkContract.js';
import type {ResolvedDocument,TextBlock,TextInline,Table,TableRow,TableCell,ImageBlock,ContentsBlock} from '../composition/resolvedDocument.js';
export interface StringField {type:'string';required?:boolean;default?:string;allowEmpty?:boolean;label?:string;description?:string}
export interface ImageField {type:'image';required?:boolean;default?:string;label?:string;description?:string}
export interface LinkField {type:'link';required?:boolean;default?:BoundLink;label?:string;description?:string}
export type BindingScope='global'|'section'|'header'|'footer'|'local'|'item';
export type ScalarBinding=string|{scope:BindingScope;key:string};
export type TemplateLink={id:string}&({type:'url';value:ScalarBinding}|{type:'link';text:ScalarBinding;url:ScalarBinding}|{type:'reference';text:ScalarBinding;target:ScalarBinding});
export type TemplateInline=Exclude<TextInline,{type:'url'|'link'|'reference'}>|FieldRef|TemplateLink;
export interface ArrayField {type:'array';required?:boolean;default?:Record<string,string|BoundLink>[];items:ObjectSchema<StringField|LinkField|ImageField>;label?:string;description?:string}
export interface ObjectSchema<F=StringField|ArrayField|ImageField|LinkField|AreaField> {type:'object';fields:Record<string,F>}
export interface FieldRef {id:string;type:'field-ref';scope:BindingScope;key:string}
export type TemplateTextBlock=Omit<TextBlock,'children'|'props'>&{props:Omit<TextBlock['props'],'anchorId'>&{anchorId?:ScalarBinding};children:TemplateInline[]};
export type TemplateImageBlock=Omit<ImageBlock,'props'>&{props:{width:ImageBlock['props']['width'];height:ImageBlock['props']['height'];align?:ImageBlock['props']['align'];source:{scope:BindingScope;key:string}}};
export interface AreaEntry {format:string;data:Record<string,unknown>}
export interface AreaField {type:'area';areaId:string;required?:boolean;default?:AreaEntry[];label?:string;description?:string}
export interface TemplateArea {id:string;type:'area';props:{areaId:string}}
export type TemplateNode=TemplateArea|TemplateTextBlock|Table|TableRow|TableCell|TemplateImageBlock|ContentsBlock;
export interface Fragment {rootIds:string[];nodes:Record<string,TemplateNode>}
export interface Repeat {tableId:string;rowTemplateId:string;source:{scope:'global'|'section'|'local';key:string}}
export interface CellRepeat {id:string;cellId:string;childTemplateIds:string[];source:{scope:'global'|'section'|'local';key:string}}
export interface Format {label?:string;description?:string;inputSchema:ObjectSchema;fragment:Fragment;repeats:Repeat[];cellRepeats?:CellRepeat[]}
export interface AreaFormat extends Format {key:string;ownerAreaId:string}
interface TemplateBase {
 header?:PageBandDefinition;footer?:PageBandDefinition;
 areaFormats?:Record<string,AreaFormat>;
 schemaVersion:1;templateId:string;docKey:string;version:number;name:string;
 styles:ResolvedDocument['styles'];globalSchema:ObjectSchema;
 formats:Record<string,Format>;examples:{name:string;request:unknown}[];
}
export interface PageLayout {label?:string;page:ResolvedDocument['book']['page']}
export interface TemplateSection {headerMode?:BandMode;footerMode?:BandMode;role?:'body'|'cover';id:string;label?:string;pageLayoutId?:string;source:{kind:'blank'}|{kind:'content'}|({kind:'authored'}&Pick<Format,'fragment'|'repeats'|'cellRepeats'>)}
export type LegacyTemplateDefinition=TemplateBase&({nodeModelVersion:4|5|6|7|8|9|10|11;book:ResolvedDocument['book']}|{nodeModelVersion:12|13|14;book:{contentSlot:'body';defaultPageLayoutId:string};pageLayouts:Record<string,PageLayout>;sections:TemplateSection[]});
export interface ValidatedTemplate {readonly definition:TemplateDefinition;readonly fingerprint:string}

export type BandMode='all'|'first'|'continuation'|'none';
export type BandSizing={mode:'content';minHeight?:import('../composition/resolvedDocument.js').Length;maxHeight?:import('../composition/resolvedDocument.js').Length}|{mode:'fixed';height:import('../composition/resolvedDocument.js').Length};
export interface BandColumns {id:string;type:'columns';props:{gap?:import('../composition/resolvedDocument.js').Length};columns:{weight:number;childIds:string[]}[]}
export interface PageBandDefinition {inputSchema:ObjectSchema<StringField|ImageField|LinkField>;fragment:{rootIds:string[];nodes:Record<string,TemplateTextBlock|TemplateImageBlock|BandColumns>};baseTextStyleId:string;sizing?:BandSizing;gap?:import('../composition/resolvedDocument.js').Length}

export interface Section15 extends TemplateSection {key:string;inputSchema:ObjectSchema;formats:Record<string,Format>;header?:PageBandDefinition;footer?:PageBandDefinition}
export type Template15=Omit<TemplateBase,'header'|'footer'|'formats'>&{nodeModelVersion:15;book:{contentSlot:'body';defaultPageLayoutId:string};pageLayouts:Record<string,PageLayout>;sections:Section15[]};
export type TemplateDefinition=LegacyTemplateDefinition|Template15;
