import {composePageBand} from './composePageBand.js';
import {validateResolvedDocument} from './validateResolvedDocument.js';
import {composeSections} from './composeSections.js';
import {buildAreaIndex} from '../template/areas.js';
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
 const areaOptions=t.nodeModelVersion>=11?{areaIndex:buildAreaIndex(t)}:{};
 const document:ResolvedDocument={schemaVersion:1,nodeModelVersion:t.nodeModelVersion,template:{templateId:t.templateId,docKey:t.docKey,version:t.version},book:structuredClone((t.nodeModelVersion===12||t.nodeModelVersion===13||t.nodeModelVersion===14)?{contentSlot:'body' as const,page:t.pageLayouts[t.book.defaultPageLayoutId]!.page}:t.book as ResolvedDocument['book']),styles:structuredClone(t.styles),rootIds:[],nodes:Object.create(null),sourceMap:Object.create(null)};
 if((t.nodeModelVersion===12||t.nodeModelVersion===13||t.nodeModelVersion===14))composeSections(t,p,document);
 else for(const entry of p.content)document.rootIds.push(...expandRows(t.formats[entry.format]!,p.data,entry.data,entry.originalIndex,entry.format,document.nodes,document.sourceMap,areaOptions));
 if((t.nodeModelVersion===12||t.nodeModelVersion===13||t.nodeModelVersion===14)&&!document.rootIds.length&&!(t.nodeModelVersion>=13&&document.sections?.some(s=>s.role==='cover'||s.sourceKind==='blank')))return {ok:false,issues:[{code:'EMPTY_CONTENT',path:'content',message:'No layout roots after composition'}],warnings:checked.warnings};
 if(t.nodeModelVersion===14)for(const k of ['header','footer'] as const)if(t[k])document[k]=composePageBand(t[k]!,p[k]!,k);
 const empty={type:'object' as const,fields:{}};
 const issues=t.nodeModelVersion>=13?validateResolvedDocument(document):validateGraph({rootIds:document.rootIds,nodes:document.nodes},{styles:document.styles,globalSchema:empty,localSchema:empty,repeats:[],resolved:true,images:t.nodeModelVersion>=5,merged:t.nodeModelVersion>=6,links:t.nodeModelVersion>=7,contents:t.nodeModelVersion>=8,cellContent:t.nodeModelVersion>=9});
 if(!issues.length&&t.nodeModelVersion>=7)issues.push(...validateDestinations(document));
 return issues.length?{ok:false,issues:issues.map(i=>({...i,code:'INVALID_DATA'})),warnings:checked.warnings}:{ok:true,value:document,warnings:checked.warnings};
}
