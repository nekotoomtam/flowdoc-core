import type {BoundLink} from '../composition/linkContract.js';
import type {ResolvedDocument,TextBlock,TextInline,Table,TableRow,TableCell,ImageBlock,ContentsBlock} from '../composition/resolvedDocument.js';
export interface StringField {type:'string';required?:boolean;default?:string;allowEmpty?:boolean;label?:string;description?:string}
export interface ImageField {type:'image';required?:boolean;default?:string;label?:string;description?:string}
export interface LinkField {type:'link';required?:boolean;default?:BoundLink;label?:string;description?:string}
export type ScalarBinding=string|{scope:'global'|'local'|'item';key:string};
export type TemplateLink={id:string}&({type:'url';value:ScalarBinding}|{type:'link';text:ScalarBinding;url:ScalarBinding}|{type:'reference';text:ScalarBinding;target:ScalarBinding});
export type TemplateInline=Exclude<TextInline,{type:'url'|'link'|'reference'}>|FieldRef|TemplateLink;
export interface ArrayField {type:'array';required?:boolean;default?:Record<string,string|BoundLink>[];items:ObjectSchema<StringField|LinkField>;label?:string;description?:string}
export interface ObjectSchema<F=StringField|ArrayField|ImageField|LinkField> {type:'object';fields:Record<string,F>}
export interface FieldRef {id:string;type:'field-ref';scope:'global'|'local'|'item';key:string}
export type TemplateTextBlock=Omit<TextBlock,'children'|'props'>&{props:Omit<TextBlock['props'],'anchorId'>&{anchorId?:ScalarBinding};children:TemplateInline[]};
export type TemplateImageBlock=Omit<ImageBlock,'props'>&{props:{width:ImageBlock['props']['width'];height:ImageBlock['props']['height'];align?:ImageBlock['props']['align'];source:{scope:'global'|'local';key:string}}};
export type TemplateNode=TemplateTextBlock|Table|TableRow|TableCell|TemplateImageBlock|ContentsBlock;
export interface Fragment {rootIds:string[];nodes:Record<string,TemplateNode>}
export interface Repeat {tableId:string;rowTemplateId:string;source:{scope:'global'|'local';key:string}}
export interface Format {label?:string;description?:string;inputSchema:ObjectSchema;fragment:Fragment;repeats:Repeat[]}
export interface TemplateDefinition {
 schemaVersion:1;nodeModelVersion:4|5|6|7|8|9;templateId:string;docKey:string;version:number;name:string;
 book:ResolvedDocument['book'];styles:ResolvedDocument['styles'];globalSchema:ObjectSchema;
 formats:Record<string,Format>;examples:{name:string;request:unknown}[];
}
export interface ValidatedTemplate {readonly definition:TemplateDefinition;readonly fingerprint:string}
