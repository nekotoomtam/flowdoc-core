import {flatBandFragment} from '../template/pageBands.js';
import {expandRowsSteps,driveMemory,type BindingEffect} from '../binding/expansionSteps.js';
import type {PageBandDefinition,BandColumns,Format} from '../template/types.js';
import type {PreparedData} from '../data/types.js';
import type {ResolvedBand,DocumentNode} from './resolvedDocument.js';
export function* composePageBandSteps(b:PageBandDefinition,data:PreparedData,scope:'header'|'footer',scopes?:import('../binding/bindInlines.js').BindingScopes|Partial<import('../binding/bindInlines.js').BindingScopes>,sectionId=scope as string,budget?:import('../binding/expansionBudget.js').ExpansionBudget,access?:import('../template/taskAccess.js').TemplateAccess):Generator<BindingEffect,ResolvedBand,any> {
 const prefix=`${sectionId===scope?'':'section-'+sectionId+'~'}band-${scope}~`,out:ResolvedBand={rootIds:[],nodes:Object.create(null),sourceMap:Object.create(null),baseTextStyleId:b.baseTextStyleId,...(b.placement?{placement:structuredClone(b.placement)}:{}),...(b.sizing?{sizing:structuredClone(b.sizing)}:{}),...(b.gap?{gap:structuredClone(b.gap)}:{})};
 yield*expandRowsSteps({fragment:flatBandFragment(b),inputSchema:b.inputSchema,repeats:[]} as Format,scopes?.global??data,{},undefined,undefined,out.nodes as Record<string,DocumentNode>,out.sourceMap,{access,budget,prefix,scopes,origin:{origin:'authored',sectionId}});
 for(const n of Object.values(b.fragment.nodes))if(n.type==='columns'){budget?.take();const id=prefix+n.id;out.nodes[id]={...structuredClone(n),id,columns:n.columns.map(c=>({...c,childIds:c.childIds.map(x=>prefix+x)}))} as BandColumns;out.sourceMap[id]={origin:'authored',sectionId,sourceId:n.id};}
 out.rootIds=b.fragment.rootIds.map(id=>prefix+id);return out;
}

export function composePageBand(...args:Parameters<typeof composePageBandSteps>):ResolvedBand{return driveMemory(composePageBandSteps(...args));}
