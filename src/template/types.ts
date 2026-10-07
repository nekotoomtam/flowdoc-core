import type {ResolvedDocument,TextBlock,TextInline,Table,TableRow,TableCell} from '../composition/resolvedDocument.js';
export interface StringField {type:'string';required?:boolean;default?:string;allowEmpty?:boolean;label?:string;description?:string}
export interface ArrayField {type:'array';required?:boolean;default?:Record<string,string>[];items:ObjectSchema<StringField>;label?:string;description?:string}
export interface ObjectSchema<F=StringField|ArrayField> {type:'object';fields:Record<string,F>}
export interface FieldRef {id:string;type:'field-ref';scope:'global'|'local'|'item';key:string}
export type TemplateTextBlock=Omit<TextBlock,'children'>&{children:(TextInline|FieldRef)[]};
export type TemplateNode=TemplateTextBlock|Table|TableRow|TableCell;
export interface Fragment {rootIds:string[];nodes:Record<string,TemplateNode>}
export interface Repeat {tableId:string;rowTemplateId:string;source:{scope:'global'|'local';key:string}}
export interface Format {label?:string;description?:string;inputSchema:ObjectSchema;fragment:Fragment;repeats:Repeat[]}
export interface TemplateDefinition {
 schemaVersion:1;nodeModelVersion:4;templateId:string;docKey:string;version:number;name:string;
 book:ResolvedDocument['book'];styles:ResolvedDocument['styles'];globalSchema:ObjectSchema;
 formats:Record<string,Format>;examples:{name:string;request:unknown}[];
}
export interface ValidatedTemplate {readonly definition:TemplateDefinition;readonly fingerprint:string}
