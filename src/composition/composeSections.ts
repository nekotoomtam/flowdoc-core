import {instanceSectionId} from '../data/prepareAssembly.js';
import { ExpansionBudget } from '../binding/expansionBudget.js';
import { normalizeNumbering } from '../template/pageNumbering.js';
import { composePageBandSteps } from './composePageBand.js';
import type { TemplateDefinition } from '../template/types.js';
import type { PreparedInput } from '../data/types.js';
import type { ResolvedDocument } from './resolvedDocument.js';
import { buildAreaIndex } from '../template/areas.js';
import { expandRowsSteps,driveMemory,type BindingEffect } from '../binding/expansionSteps.js';
export function* composeSectionsSteps(t: TemplateDefinition, p: PreparedInput, d: ResolvedDocument,budget = new ExpansionBudget(),access?:import('../template/taskAccess.js').TemplateAccess): Generator<BindingEffect,void,any> {
    const areaIndex = access?.areaIndex ?? buildAreaIndex(t);
    d.sections = [];
    const formatInstances:import('./resolvedDocument.js').FormatInstance[]=[];
    const uses=t.nodeModelVersion===20?(p.sections as import('../data/types.js').PreparedSection20[]).map(value=>({s:t.sections.find(s=>s.id===value.id)!,value})):t.sections.map(s=>({s,value:Array.isArray(p.sections)?p.sections.find(v=>v.id===s.id)!:p.sections![s.id]!}));
    for (const {s,value} of uses) {
        const data = value.data, scopes = { section: data };
        const use=value as import('../data/types.js').PreparedSection20;
        const sectionId = t.nodeModelVersion===20?instanceSectionId(use.instanceKey):s.id, prefix = `section-${sectionId}~`, pageLayoutId = s.pageLayoutId ?? t.book.defaultPageLayoutId;
        const rootIds = s.source.kind === 'blank' ? [] : yield*expandRowsSteps({ ...s.source, inputSchema: { type: 'object', fields: {} } }, p.data, {}, undefined, undefined, d.nodes, d.sourceMap, { access, budget, areaIndex, scopes, prefix, rootOffset:0, formatInstances, origin: { origin: 'authored', sectionId } });
        d.sections.push({ ...({ numbering: normalizeNumbering(s as import("../template/types.js").AreaSection) }), ...({ headerMode: s.headerMode ?? 'all', footerMode: s.footerMode ?? 'all' }), ...({ role: s.role ?? 'body', sourceKind: s.source.kind }), ...(t.nodeModelVersion===20?{definitionId:s.id,instanceKey:use.instanceKey,sectionKey:use.sectionKey}:{}),sectionId, pageLayoutId, page: structuredClone(t.pageLayouts[pageLayoutId]!.page), rootIds });
        const last=s.source.kind==='authored'?s.source.fragment.nodes[s.source.fragment.rootIds.at(-1)!]:undefined;
        if(last?.type==='area'&&last.props.verticalAlign==='bottom'){
            const ids=rootIds.filter(id=>d.sourceMap[id]?.areaId===last.props.areaId);
            d.sections.at(-1)!.endingArea={areaId:last.props.areaId,verticalAlign:'bottom',rootIds:ids,rootStartIndex:rootIds.length-ids.length};
        }
        {
            const def = s as import('../template/types.js').AreaSection;
            for (const k of ['header', 'footer'] as const)
                if (def[k])
                    d.sections[d.sections.length - 1]![k] = yield*composePageBandSteps(def[k]!, value![k]!, k, { global: p.data, section: data, [k]: value![k]! }, sectionId, budget,access);
        }
        if(t.nodeModelVersion!==18){
         const nodes=[...Object.values(d.nodes).filter(n=>d.sourceMap[n.id]?.sectionId===sectionId),...Object.values(d.sections.at(-1)?.header?.nodes??{}),...Object.values(d.sections.at(-1)?.footer?.nodes??{})];
         const anchor=(owner:string,local:string)=>JSON.stringify([owner,local]);
         for(const n of nodes)if(n.type==='text-block'){
          if(n.props.anchorId!==undefined)n.props.anchorId=anchor(sectionId,n.props.anchorId);
          for(const c of n.children)if(c.type==='reference'){const ref=c as typeof c&{targetSectionId?:string;targetInstanceKey?:string};ref.target=anchor(t.nodeModelVersion===20?(ref.targetInstanceKey?instanceSectionId(ref.targetInstanceKey):sectionId):(ref.targetSectionId??sectionId),ref.target);delete ref.targetSectionId;delete ref.targetInstanceKey;}
         }
        }
        d.rootIds.push(...rootIds);
    }
    if(formatInstances.length)d.formatInstances=formatInstances;
}

export function composeSections(t:TemplateDefinition,p:PreparedInput,d:ResolvedDocument):void{driveMemory(composeSectionsSteps(t,p,d));}
