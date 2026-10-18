import { validateNumbering } from './pageNumbering.js';
import {isFormatSizing} from './formatSizing.js';
import { createHash } from 'node:crypto';
import { object, keys, name, own, isJson, issue, canonical, freeze } from './checks.js';
import { validateSchemas } from './validateSchemas.js';
import { validatePageSections } from './pageSections.js';
import { validatePageBand } from './pageBands.js';
import { validateGraph } from './validateGraph.js';
import { buildAreaIndex } from './areas.js';
import { validateValues } from '../data/validateValues.js';
import {prepareInstances} from '../data/prepareInstances.js';
import { prepareSections } from '../data/prepareSections.js';
import type { Template18, Format, AreaSection, ValidatedTemplate, ObjectSchema } from './types.js';
import type { Issue, Result } from '../result.js';
const empty: ObjectSchema = { type: 'object', fields: {} };
export function validateOwnedTemplate(input: unknown): Result<ValidatedTemplate> {
    const issues: Issue[] = [], fail = (p: string) => issues.push(issue('INVALID_TEMPLATE', p));
    if (!isJson(input) || !object(input))
        return { ok: false, issues: [issue('INVALID_TEMPLATE', 'template')], warnings: [] };
    const t = structuredClone(input) as any;
    if (!keys(t, ['schemaVersion', 'nodeModelVersion', 'templateId', 'docKey', 'version', 'name', 'book', 'styles', 'globalSchema', 'examples', 'pageLayouts', 'sections', 'areaFormats']) || ![1,2].includes(t.schemaVersion) || ![18,19].includes(t.nodeModelVersion))
        fail('template');
    for (const k of ['templateId', 'docKey', 'name'])
        if (!name(t[k]))
            fail(k);
    if (!Number.isInteger(t.version) || t.version < 1)
        fail('version');
    validateSchemas(t.globalSchema, 'globalSchema', issues, false, true, true, true, true, 2);
    if (!Array.isArray(t.sections) || !t.sections.length)
        fail('sections');
    const seen = new Set<string>(), areaIds = new Set<string>();
    const schemas: any[] = [t.globalSchema];
    for (const [i, s] of (Array.isArray(t.sections) ? t.sections : []).entries()) {
        const p = `sections[${i}]`;
        if (!object(s)) {
            fail(p);
            continue;
        }
        issues.push(...validateNumbering(s, p));
        if ((s.source?.kind === 'content' || (t.nodeModelVersion===18 ? !object(s.formats) || Object.keys(s.formats).length : own(s,'formats') || own(s,'key'))))
            fail(p + '.source');
        if (t.nodeModelVersion===18 && (!name(s.key) || s.key.includes('.') || seen.has(s.key)))
            fail(p + '.key');
        else
            seen.add(s.key);
        validateSchemas(s.inputSchema, p + '.inputSchema', issues, false, true, true, true, true, 2);
        schemas.push(s.inputSchema);
        for (const k of ['header', 'footer'])
            if (own(s, k) && !issues.length)
                issues.push(...validatePageBand(s[k], t.styles, p + '.' + k, false, { global: t.globalSchema, section: s.inputSchema, [k]: s[k]?.inputSchema }, p, true,t.nodeModelVersion===19?t.sections.map((s:any)=>s.id):undefined));
    }
    if (issues.length)
        return { ok: false, issues, warnings: [] };
    issues.push(...validatePageSections(t));
    for (const schema of schemas)
        for (const f of Object.values(schema.fields) as any[])
            if (f.type === 'area') {
                if (areaIds.has(f.areaId))
                    fail('areaId');
                areaIds.add(f.areaId);
            }
    if (t.areaFormats !== undefined && !object(t.areaFormats))
        fail('areaFormats');
    if (!issues.length)
        issues.push(...validateOwnedAreas(t));
    if (!Array.isArray(t.examples))
        fail('examples');
    if (issues.length)
        return { ok: false, issues, warnings: [] };
    const fingerprint = createHash('sha256').update(canonical(t)).digest('hex'), names = new Set<string>();
    for (const [i, e] of t.examples.entries()) {
        if (!object(e) || !keys(e, ['name', 'request']) || !name(e.name) || names.has(e.name)) {
            fail(`examples[${i}]`);
            continue;
        }
        names.add(e.name);
        if (e.request?.version !== t.version)
            fail(`examples[${i}].request.version`);
        const r = t.nodeModelVersion===19 ? prepareInstances(t,fingerprint,e.request) : prepareSections(t, fingerprint, e.request);
        issues.push(...[...(!r.ok ? r.issues : []), ...r.warnings].map(x => ({ ...x, code: 'INVALID_TEMPLATE', path: `examples[${i}].request.` + x.path })));
    }
    return issues.length ? { ok: false, issues, warnings: [] } : { ok: true, value: freeze({ definition: t, fingerprint }), warnings: [] };
}
function validateOwnedGraph(t: import('./types.js').TemplateDefinition, s: import('./types.js').TemplateDefinition['sections'][number], f: Format, path: string, areas = true, fixedRootIds: string[] = []): Issue[] { return validateGraph(f.fragment, { sectionIds:t.nodeModelVersion===19?t.sections.map(s=>s.id):undefined, pageBreaks: true, fixedRootIds, styles: t.styles, globalSchema: t.globalSchema, localSchema: f.inputSchema, scopeSchemas: { global: t.globalSchema, section: s.inputSchema, local: f.inputSchema }, rowGroups: true, groupLabelSpans:t.nodeModelVersion===19, groupDeclarations: f.rowGroups, repeats: f.repeats, cellRepeats: f.cellRepeats ?? [], heightModes: true, images: true, merged: true, links: true, contents: true, scopedContents: t.nodeModelVersion===19, cellContent: true, itemImages: true, areas }, path + '.fragment'); }
function validateOwnedAreas(t: import('./types.js').TemplateDefinition): Issue[] {
    const issues: Issue[] = [], fail = (p: string) => issues.push(issue('INVALID_TEMPLATE', p)), index = buildAreaIndex(t), placements = new Map<string, {
        section: import('./types.js').TemplateDefinition['sections'][number];
        count: number;
        topLevel: boolean;
    }>();
    for (const s of t.sections)
        for (const [host, f] of (s.source.kind === 'authored' ? [['', s.source] as const] : []))
            for (const n of Object.values(f.fragment.nodes))
                if (n.type === 'area') {
                    const a = index.byId.get(n.props.areaId), p = `sections.${s.id}.area.${n.props.areaId}`;
                    if (!a || (a.sectionId !== undefined && a.sectionId !== s.id)) {
                        fail(p);
                        continue;
                    }
                    const prev = placements.get(a.field.areaId);
                    placements.set(a.field.areaId, { section: s, count: (prev?.count ?? 0) + 1, topLevel: f.fragment.rootIds.includes(n.id) });
                    const cell = Object.values(f.fragment.nodes).find((v: any) => v.type === 'table-cell' && v.childIds.includes(n.id)) as any;
                    if (cell) {
                        const row = Object.values(f.fragment.nodes).find((v: any) => v.type === 'table-row' && v.cellIds.includes(cell.id)) as any;
                        const table = Object.values(f.fragment.nodes).find((v: any) => v.type === 'table' && v.rowIds.includes(row?.id)) as any;
                        if (!row || !table || table.rowIds.indexOf(row.id) < table.props.headerRowCount || f.repeats.some(r => r.rowTemplateId === row.id) || f.cellRepeats?.some(r => r.childTemplateIds.includes(n.id)))
                            fail(p);
                        for (const sf of a.formatsByKey.values())
                            if (!sf.format.fragment?.rootIds?.every(id => ['text-block', 'image'].includes(sf.format.fragment.nodes[id]?.type ?? '')))
                                fail(p + '.cellContent');
                    }
                }
    const names = new Set<string>();
    for (const [id, f] of Object.entries(t.areaFormats ?? {})) {
        const p = 'areaFormats.' + id, a = index.byId.get(f?.ownerAreaId), place = a && placements.get(a.field.areaId), key = JSON.stringify([f?.ownerAreaId, f?.key]);
        if (!name(id) || id.includes('~') || !object(f) || !keys(f, ['key', 'ownerAreaId', 'label', 'description', 'inputSchema', 'fragment', 'repeats', 'cellRepeats', 'sizing', ...(['rowGroups'])]) || !name(f.key) || !a || !place || names.has(key)) {
            fail(p);
            continue;
        }
        names.add(key);
        if(own(f,'sizing')&&(t.nodeModelVersion!==19||!isFormatSizing(f.sizing)||(f.sizing.mode==='fixed'&&(!place.topLevel||Object.values(f.fragment?.nodes??{}).some((n:any)=>n?.type==='table-of-contents')))))fail(p+'.sizing');
        const valid = validateSchemas(f.inputSchema, p + '.inputSchema', issues, false, true, true, true, false, 2);
        if (!Array.isArray(f.repeats) || (f.cellRepeats !== undefined && !Array.isArray(f.cellRepeats)))
            fail(p + '.repeats');
        else if (valid)
            issues.push(...validateOwnedGraph(t, place.section, f, p, false, t.nodeModelVersion === 19 && place.topLevel ? f.fragment.rootIds : []));
    }
    for (const [id, a] of index.byId) {
        if (placements.get(id)?.count !== 1 || !a.formatsByKey.size)
            fail('area.' + id);
        if (own(a.field, 'default')) {
            const errors: Issue[] = [], warnings: Issue[] = [];
            validateValues({ type: 'object', fields: { [a.key]: a.field } }, { [a.key]: a.field.default }, 'area.' + id, errors, warnings, 'request', false, index);
            issues.push(...[...errors, ...warnings].map(i => ({ ...i, code: 'INVALID_TEMPLATE' })));
        }
    }
    return issues;
}
