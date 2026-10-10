import {flatBandFragment} from '../template/pageBands.js';
import {expandRows} from '../binding/expandRows.js';
import type {PageBandDefinition,BandColumns,Format} from '../template/types.js';
import type {PreparedData} from '../data/types.js';
import type {ResolvedBand,DocumentNode} from './resolvedDocument.js';
export function composePageBand(b:PageBandDefinition,data:PreparedData,scope:'header'|'footer'):ResolvedBand {
 const prefix=`band-${scope}~`,out:ResolvedBand={rootIds:[],nodes:Object.create(null),sourceMap:Object.create(null),baseTextStyleId:b.baseTextStyleId,...(b.sizing?{sizing:structuredClone(b.sizing)}:{}),...(b.gap?{gap:structuredClone(b.gap)}:{})};
 expandRows({fragment:flatBandFragment(b),inputSchema:b.inputSchema,repeats:[]} as Format,data,{},undefined,undefined,out.nodes as Record<string,DocumentNode>,out.sourceMap,{prefix,origin:{origin:'authored',sectionId:scope}});
 for(const n of Object.values(b.fragment.nodes))if(n.type==='columns'){const id=prefix+n.id;out.nodes[id]={...structuredClone(n),id,columns:n.columns.map(c=>({...c,childIds:c.childIds.map(x=>prefix+x)}))} as BandColumns;out.sourceMap[id]={origin:'authored',sectionId:scope,sourceId:n.id};}
 out.rootIds=b.fragment.rootIds.map(id=>prefix+id);return out;
}
