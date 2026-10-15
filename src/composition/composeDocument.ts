import {ExpansionLimitError} from '../binding/expansionBudget.js';

import {validateResolvedDocument} from './validateResolvedDocument.js';
import {composeSections} from './composeSections.js';
import {buildAreaIndex} from '../template/areas.js';
import {validateDestinations} from './linkContract.js';
import type {Result} from '../result.js';
import type {ValidatedTemplate} from '../template/types.js';
import type {PreparedInput} from '../data/types.js';
import type {ResolvedDocument} from './resolvedDocument.js';
import {validatePreparedInput} from './validatePreparedInput.js';

import {validateGraph} from '../template/validateGraph.js';
export function composeDocument(template:ValidatedTemplate,input:PreparedInput):Result<ResolvedDocument>{
 const checked=validatePreparedInput(template,input);if(!checked.ok)return checked;
 const p=checked.value,t=template.definition;
 const document:ResolvedDocument={schemaVersion:1,nodeModelVersion:18,template:{templateId:t.templateId,docKey:t.docKey,version:t.version},book:{contentSlot:'body',page:structuredClone(t.pageLayouts[t.book.defaultPageLayoutId]!.page)},styles:structuredClone(t.styles),rootIds:[],nodes:Object.create(null),sourceMap:Object.create(null)};
 try {
 composeSections(t,p,document);
 if(!document.rootIds.some(id=>document.nodes[id]?.type!=='page-break')&&!document.sections?.some(s=>s.role==='cover'||s.sourceKind==='blank'))return {ok:false,issues:[{code:'EMPTY_CONTENT',path:'content',message:'No layout roots after composition'}],warnings:checked.warnings};
 }catch(error){if(error instanceof ExpansionLimitError)return {ok:false,issues:[{code:'EXPANSION_LIMIT',path:'document',message:error.message}],warnings:checked.warnings};throw error;}
 const issues=validateResolvedDocument(document);
 if(!issues.length)issues.push(...validateDestinations(document));
 return issues.length?{ok:false,issues:issues.map(i=>({...i,code:'INVALID_DATA'})),warnings:checked.warnings}:{ok:true,value:document,warnings:checked.warnings};
}
