import {validateDestinations} from './linkContract.js';
import type {Result} from '../result.js';
import type {ValidatedTemplate} from '../template/types.js';
import type {PreparedInput} from '../data/types.js';
import type {ResolvedDocument} from './resolvedDocument.js';
import {validatePreparedInput} from './validatePreparedInput.js';
import {expandRows} from '../binding/expandRows.js';
import {validateGraph} from '../template/validateGraph.js';
export function composeDocument(template:ValidatedTemplate,input:PreparedInput):Result<ResolvedDocument>{
 const checked=validatePreparedInput(template,input);if(!checked.ok)return checked;
 const p=checked.value,t=template.definition;
 const document:ResolvedDocument={schemaVersion:1,nodeModelVersion:t.nodeModelVersion,template:{templateId:t.templateId,docKey:t.docKey,version:t.version},book:structuredClone(t.book),styles:structuredClone(t.styles),rootIds:[],nodes:Object.create(null),sourceMap:Object.create(null)};
 for(const entry of p.content)document.rootIds.push(...expandRows(t.formats[entry.format]!,p.data,entry.data,entry.originalIndex,entry.format,document.nodes,document.sourceMap));
 const empty={type:'object' as const,fields:{}};
 const issues=validateGraph({rootIds:document.rootIds,nodes:document.nodes},{styles:document.styles,globalSchema:empty,localSchema:empty,repeats:[],resolved:true,images:t.nodeModelVersion>=5,merged:t.nodeModelVersion>=6,links:t.nodeModelVersion>=7,contents:t.nodeModelVersion===8});
 if(!issues.length&&t.nodeModelVersion>=7)issues.push(...validateDestinations(document));
 return issues.length?{ok:false,issues:issues.map(i=>({...i,code:'INVALID_DATA'})),warnings:checked.warnings}:{ok:true,value:document,warnings:checked.warnings};
}
