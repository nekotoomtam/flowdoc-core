import { ExpansionBudget } from '../binding/expansionBudget.js';
import { normalizeNumbering } from '../template/pageNumbering.js';
import { composePageBand } from './composePageBand.js';
import type { TemplateDefinition } from '../template/types.js';
import type { PreparedInput } from '../data/types.js';
import type { ResolvedDocument } from './resolvedDocument.js';
import { buildAreaIndex } from '../template/areas.js';
import { expandRows } from '../binding/expandRows.js';
export function composeSections(t: TemplateDefinition, p: PreparedInput, d: ResolvedDocument): void {
    const budget = new ExpansionBudget();
    const areaIndex = buildAreaIndex(t);
    d.sections = [];
    const formatInstances:import('./resolvedDocument.js').FormatInstance[]=[];
    for (const s of t.sections) {
        const value = Array.isArray(p.sections)?p.sections.find(v=>v.id===s.id)!:p.sections![s.id]!, data = value.data, scopes = { section: data };
        const sectionId = s.id, prefix = `section-${sectionId}~`, pageLayoutId = s.pageLayoutId ?? t.book.defaultPageLayoutId;
        const rootIds = s.source.kind === 'blank' ? [] : expandRows({ ...s.source, inputSchema: { type: 'object', fields: {} } }, p.data, {}, undefined, undefined, d.nodes, d.sourceMap, { budget, areaIndex, scopes, prefix, rootOffset:0, formatInstances, origin: { origin: 'authored', sectionId } });
        d.sections.push({ ...({ numbering: normalizeNumbering(s as import("../template/types.js").AreaSection) }), ...({ headerMode: s.headerMode ?? 'all', footerMode: s.footerMode ?? 'all' }), ...({ role: s.role ?? 'body', sourceKind: s.source.kind }), sectionId, pageLayoutId, page: structuredClone(t.pageLayouts[pageLayoutId]!.page), rootIds });
        {
            const def = s as import('../template/types.js').AreaSection;
            for (const k of ['header', 'footer'] as const)
                if (def[k])
                    d.sections[d.sections.length - 1]![k] = composePageBand(def[k]!, value![k]!, k, { global: p.data, section: data, [k]: value![k]! }, s.id, budget);
        }
        if(t.nodeModelVersion===19){
         const nodes=[...Object.values(d.nodes).filter(n=>d.sourceMap[n.id]?.sectionId===s.id),...Object.values(d.sections.at(-1)?.header?.nodes??{}),...Object.values(d.sections.at(-1)?.footer?.nodes??{})];
         const anchor=(owner:string,local:string)=>JSON.stringify([owner,local]);
         for(const n of nodes)if(n.type==='text-block'){
          if(n.props.anchorId!==undefined)n.props.anchorId=anchor(s.id,n.props.anchorId);
          for(const c of n.children)if(c.type==='reference'){const ref=c as typeof c&{targetSectionId?:string};ref.target=anchor(ref.targetSectionId??s.id,ref.target);delete ref.targetSectionId;}
         }
        }
        d.rootIds.push(...rootIds);
    }
    if(formatInstances.length)d.formatInstances=formatInstances;
}
