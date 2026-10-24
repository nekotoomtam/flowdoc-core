import { required } from './types.js';
import type { ExportIntent, Result } from './types.js';
import { capture, fail, freeze } from './types.js';
import { requireGenuineIntent, intentResourceBytes } from './profile.js';
import { toPoints,toTwips } from './units.js';
import { ownsPoint } from './text-intent.js';
import {measuredReadingExtent,hasReadingMeasurements} from './reading-measurements.js';
import {textEnvelope} from './font-envelope.js';
export interface Fragment {
    nodeId: string;
    start: number;
    end: number;
    keepNext: boolean;
    keepLines: boolean;
    spans?: {
        id: string;
        type: string;
        sourceRange: number[];
        localRange: number[];
        originalRange: readonly number[];
    }[];
}
export interface ReadingPlan {
    fragments: Fragment[];
    separators: {
        nodeId: string;
        start: number;
        end: number;
    }[];
    edges: {
        kind: 'heading-table';
        from: string;
        to: string;
    }[];
    keptRows: Record<string, string[]>;
    eligibility: 'conservative-source-font-envelope';
    wordFitVerified: false;
}
const measuredPlans=new WeakMap<ExportIntent,Result<ReadingPlan>>();
export function deriveReadingPlan(intent: ExportIntent): Result<ReadingPlan> {
    const previous=measuredPlans.get(intent);if(previous)return previous;
    const result=capture(() => {
        requireGenuineIntent(intent);
        const nodes: any = intent.document.nodes, plan: ReadingPlan = { fragments: intent.textBlocks.filter(t => t.scope === 'nodes').map(t => ({ nodeId: t.nodeId, start: 0, end: t.text.length, keepNext: false, keepLines: false })), separators: [], edges: [], keptRows: Object.create(null), eligibility: 'conservative-source-font-envelope', wordFitVerified: false };
        const unsupported = (id: string, why: string): never => fail('DOCX_REQUIRED_RELATION_UNSUPPORTED', 'nodes.' + id, why, id);
        const metrics = new Map<string, {
            width: number;
            height: number;
        }>();
        function textBound(id: string, width: number): number {
            if (nodes[id].props.heightMode === 'fixed')
                return toPoints(nodes[id].props.height);
            const block = intent.textBlocks.find(t => t.scope === 'nodes' && t.nodeId === id)!;
            const measured=measuredReadingExtent(intent,'nodes',id,width);if(measured)return measured.height;
            const style = required(intent.styles[block.styleId], 'styles');
            let metric = metrics.get(style.font.id);
            if (!metric) {
                const b = Buffer.from(intentResourceBytes(intent, 'font', style.font.id)), tables = new Map<string, {
                    o: number;
                    l: number;
                }>();
                for (let i = 0; i < b.readUInt16BE(4); i++) {
                    const at = 12 + i * 16;
                    tables.set(b.toString('ascii', at, at + 4), { o: b.readUInt32BE(at + 8), l: b.readUInt32BE(at + 12) });
                }
                const head = tables.get('head')!, h = tables.get('hhea'), os = tables.get('OS/2')!;
                if (!h || h.l < 12 || os.l < 78)
                    unsupported(id, 'Required group lacks bounded source font metrics');
                const units = b.readUInt16BE(head.o + 18);
                metric = { width: Math.max(b.readUInt16BE(h!.o + 10), b.readInt16BE(head.o + 40) - b.readInt16BE(head.o + 36)) / units, height: Math.max(b.readInt16BE(head.o + 42) - b.readInt16BE(head.o + 38), b.readInt16BE(h!.o + 4) - b.readInt16BE(h!.o + 6) + Math.max(0, b.readInt16BE(h!.o + 8)), b.readUInt16BE(os.o + 74) + b.readUInt16BE(os.o + 76)) / units };
                metrics.set(style.font.id, metric);
            }
            const lines = block.text.split('\n'), size = style.sizeHalfPoints / 2;
            if (lines.some(line => line.length * metric.width * size > width))
                return Infinity;
            return lines.length * Math.max(style.line.twips / 20, metric.height * size);
        }
        function section(id: string) { const sid = (intent.document.sourceMap as any)[id].sectionId; return (intent.document.sections as any[]).find(s => s.sectionId === sid); }
        function height(id: string) { const pg = section(id).page; return (pg.orientation === 'portrait' ? 297 : 210) * 72 / 25.4 - toPoints(pg.margin.top) - toPoints(pg.margin.bottom); }
        function budget(id: string) {
            if(!hasReadingMeasurements(intent))return Math.min(120,height(id)/3);
            const s=section(id),index=intent.document.sections!.indexOf(s),pg=s.page,pw=(pg.orientation==='portrait'?210:297)*72/25.4;
            const reservation=(kind:'header'|'footer')=>{
                const b=s[kind]??(intent.document as any)[kind],edge=kind==='header'?'top':'bottom',margin=toPoints(pg.margin[edge]);
                if(!b||s.role!=='body'||s.sourceKind==='blank'||s[kind+'Mode']==='none')return margin;
                const scope=s[kind]?`sections.${index}.${kind}.nodes`:`${kind}.nodes`,left=b.placement?toPoints(b.placement.left):toPoints(pg.margin.left),right=b.placement?toPoints(b.placement.right):toPoints(pg.margin.right);
                const stack=(ids:string[],width:number):number=>{let sum=0;for(const id of ids){const n=b.nodes[id];
                    if(n.type==='text-block')sum+=n.props.heightMode==='fixed'?toPoints(n.props.height):textEnvelope(intent,id,scope,width);
                    else if(n.type==='image')sum+=toPoints(n.props.height)+1;
                    else if(n.type==='line')sum+=1+Math.round((n.props.thickness?toPoints(n.props.thickness):.5)*8)/8+((n.props.spaceBefore?toTwips(n.props.spaceBefore):0)+(n.props.spaceAfter?toTwips(n.props.spaceAfter):0))/20;
                    else if(n.type==='columns'){const gap=n.props.gap?toPoints(n.props.gap):0,total=n.columns.reduce((v:number,c:any)=>v+c.weight,0);sum+=Math.max(1,...n.columns.map((c:any)=>stack(c.childIds,(width-gap*(n.columns.length-1))*c.weight/total)));}
                    else return Infinity;
                }if(ids.length&&b.nodes[ids.at(-1)!].type==='columns')sum+=1;return sum;};
                const extent=stack(b.rootIds,pw-left-right)+(left!==toPoints(pg.margin.left)||right!==toPoints(pg.margin.right)?1:0);
                return Math.max(margin,(b.placement?toPoints(b.placement.offset):margin)+extent+(b.gap?toPoints(b.gap):0));
            };
            return Math.max(0,(pg.orientation==='portrait'?297:210)*72/25.4-reservation('header')-reservation('footer'));
        }
        const widths = new Map<string, number>();
        for (const t of intent.tables) {
            const n = nodes[t.nodeId];
            for (const rid of n.rowIds)
                nodes[rid].cellIds.forEach((cid: string, index: number) => { const c = nodes[cid], col = c.props.columnIndex ?? index, span = c.props.colSpan ?? 1, pad = t.cells.find(c => c.nodeId === cid)!.paddingTwips; widths.set(cid, (t.columnTwips.slice(col, col + span).reduce((a, b) => a + b, 0) - pad.left - pad.right) / 20); });
        }
        function rowBound(tableId: string, rowId: string,firstFragment=false) { const t = intent.tables.find(t => t.nodeId === tableId)!; let height = 0; for (const cid of nodes[rowId].cellIds) {
            const c = nodes[cid], pad = t.cells.find(c => c.nodeId === cid)!.paddingTwips;
            let extent = (pad.top + pad.bottom) / 20;
            for (const child of c.childIds){
                const fragment=firstFragment&&hasReadingMeasurements(intent)&&nodes[rowId].props.allowBreak,width=widths.get(cid)!;
                const childHeight=nodes[child].type==='image'?toPoints(nodes[child].props.height)+1:fragment?measuredReadingExtent(intent,'nodes',child,width)?.firstLineHeight??textBound(child,width):textBound(child,width);
                extent+=childHeight;
                if(firstFragment&&hasReadingMeasurements(intent)&&nodes[rowId].props.allowBreak)break;
            }
            height = Math.max(height, extent);
        } return height; }
        for (const s of intent.document.sections as any[]) {
            const pg = s.page, width = (pg.orientation === 'portrait' ? 210 : 297) * 72 / 25.4 - toPoints(pg.margin.left) - toPoints(pg.margin.right);
            for (let i = 0; i < s.rootIds.length; i++) {
                const id = s.rootIds[i], n = nodes[id];
                if (n.type !== 'text-block' || !n.props.toc)
                    continue;
                const following = s.rootIds.slice(i + 1, i + 3);
                let group = [id];
                if (nodes[following[0]]?.type === 'table')
                    group.push(following[0]);
                else if (nodes[following[0]]?.type === 'text-block' && !nodes[following[0]].props.toc && nodes[following[1]]?.type === 'table')
                    group.push(...following);
                else
                    continue;
                const textIds = group.slice(0, -1);
                if (textIds.reduce((sum, x) => sum + textBound(x, width), 0) + rowBound(group.at(-1)!, nodes[group.at(-1)!].rowIds[0],nodes[group.at(-1)!].props.headerRowCount===0) > budget(id))
                    unsupported(id, 'Heading/description exceeds bounded table-start envelope');
                for (let j = 0; j < group.length - 1; j++) {
                    const f = plan.fragments.find(f => f.nodeId === group[j])!;
                    f.keepNext = true;
                    f.keepLines = true;
                    plan.edges.push({ kind: 'heading-table', from: required(group[j], 'group.from'), to: required(group[j + 1], 'group.to') });
                }
            }
        }
        for (const t of intent.tables) {
            const n = nodes[t.nodeId], used = new Set<string>();
            plan.keptRows[t.nodeId] = [];
            for (const g of n.rowGroups ?? []) {
                if (g.groupLabel !== undefined)
                    unsupported(n.id, 'Per-fragment groupLabel is deferred');
                const indices = g.rowIds.map((id: string) => n.rowIds.indexOf(id));
                if (!indices.length || indices.some((x: number, i: number) => i > 0 && x !== indices[i - 1] + 1) || g.rowIds.some((id: string) => used.has(id)))
                    unsupported(n.id, 'Noncontiguous/overlapping row group');
                for (const id of g.rowIds)
                    used.add(id);
                const first = g.rowIds.indexOf(g.firstMemberRowId);
                if (first < 0 || JSON.stringify(g.prefixRowIds) !== JSON.stringify(g.rowIds.slice(0, first)))
                    unsupported(n.id, 'Prefix must precede first group member in source order');
                if (!g.keepStart || !g.prefixRowIds.length)
                    continue;
                if (g.empty || g.prefixRowIds.length > 2)
                    unsupported(n.id, 'Required row start exceeds bounded prefix envelope');
                const start = n.rowIds.indexOf(g.prefixRowIds[0]), end = n.rowIds.indexOf(g.firstMemberRowId);
                for (const [origin, rid] of n.rowIds.entries())
                    for (const cid of nodes[rid].cellIds) {
                        const span = nodes[cid].props.rowSpan ?? 1;
                        if (span > 1 && origin <= end && origin + span - 1 >= start)
                            unsupported(cid, 'Required row-start window intersects a vertical merge, including earlier origins');
                    }
                let total = 0;
                if(hasReadingMeasurements(intent)&&n.props.repeatHeaderRows)for(const rid of n.rowIds.slice(0,n.props.headerRowCount))if(![...g.prefixRowIds,g.firstMemberRowId].includes(rid))total+=rowBound(t.nodeId,rid);
                for (const rid of [...g.prefixRowIds, g.firstMemberRowId]) {
                    if(hasReadingMeasurements(intent)){total+=rowBound(t.nodeId,rid,rid===g.firstMemberRowId);continue;}
                    let rowHeight = 0;
                    for (const cid of nodes[rid].cellIds) {
                        const c = nodes[cid], pad = t.cells.find(c => c.nodeId === cid)!.paddingTwips;
                        if ((c.props.rowSpan ?? 1) > 1)
                            unsupported(cid, 'Required row start intersects a vertical merge');
                        let cell = (pad.top + pad.bottom) / 20;
                        for (const child of c.childIds)
                            cell += nodes[child].type === 'image' ? toPoints(nodes[child].props.height) + 1 : textBound(child, widths.get(cid)!);
                        rowHeight = Math.max(rowHeight, cell);
                    }
                    total += rowHeight;
                }
                if (total > budget(n.id))
                    unsupported(n.id, 'Required row-start group is too large');
                required(plan.keptRows[t.nodeId], 'group.keptRows').push(...g.prefixRowIds);
            }
        }
        for (const f of plan.fragments) {
            const block = intent.textBlocks.find(t => t.scope === 'nodes' && t.nodeId === f.nodeId)!;
            f.spans = block.spans.filter(s => s.range[0] === s.range[1] ? ownsPoint(block.text, f.start, f.end, s.range[0]) : s.range[1] > f.start && s.range[0] < f.end).map(s => { const a = Math.max(f.start, s.range[0]), b = Math.min(f.end, s.range[1]); return { id: s.id, type: s.type, originalRange: s.range, sourceRange: [a, b], localRange: [a - f.start, b - f.start] }; });
        }
        return freeze(plan);
    });
    // Every native table consumes the same immutable, intent-owned reading plan.
    // Cache only after measurement, so a legacy pre-measurement call cannot pin it.
    if(result.ok&&hasReadingMeasurements(intent))measuredPlans.set(intent,result);
    return result;
}
