import { object, keys, name, own, issue } from './checks.js';
import { validateBookStyles } from '../composition/validateResolvedDocument.js';
import { validateGraph } from './validateGraph.js';
import type { Issue } from '../result.js';
import type { TemplateDefinition, Format } from './types.js';
const id = (v: unknown): v is string => name(v) && !v.includes('~');
export function validatePageSections(t: Record<string, any>): Issue[] {
    const issues: Issue[] = [], fail = (p: string) => issues.push(issue('INVALID_TEMPLATE', p));
    if (!object(t.book) || !keys(t.book, ['contentSlot', 'defaultPageLayoutId']) || t.book.contentSlot !== 'body' || !id(t.book.defaultPageLayoutId))
        fail('book');
    if (!object(t.pageLayouts) || !Object.keys(t.pageLayouts).length)
        fail('pageLayouts');
    else {
        for (const [key, v] of Object.entries(t.pageLayouts)) {
            const p = 'pageLayouts.' + key;
            if (!id(key) || !object(v) || !keys(v, ['label', 'page']) || (own(v, 'label') && typeof v.label !== 'string')) {
                fail(p);
                continue;
            }
            issues.push(...validateBookStyles({schemaVersion:t.schemaVersion, book: { contentSlot: 'body', page: v.page }, styles: t.styles }).map(i => ({ ...i, code: i.code==='INVALID_FONT_SELECTION'?i.code:'INVALID_TEMPLATE', path: i.path.startsWith('book') ? p + i.path.slice(4) : i.path })));
        }
        if (!own(t.pageLayouts, t.book?.defaultPageLayoutId))
            fail('book.defaultPageLayoutId');
    }
    if (!Array.isArray(t.sections) || !t.sections.length) {
        fail('sections');
        return issues;
    }
    const seen = new Set<string>();
    let content = 0;
    for (const [i, s] of t.sections.entries()) {
        const p = `sections[${i}]`;
        if (!object(s) || !keys(s, ['id', 'label', 'pageLayoutId', 'source', ...(['numbering']), ...(['key', 'inputSchema', 'formats', 'header', 'footer']), ...(['headerMode', 'footerMode']), ...(['role']),...(t.nodeModelVersion===19?['nameBase','origin']:[])]) || !id(s.id) || seen.has(s.id)) {
            fail(p);
            continue;
        }
        seen.add(s.id);
        if(t.nodeModelVersion===19){
         if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id)||!name(s.label)||!name(s.nameBase)||own(s,'role'))fail(p);
         if(own(s,'origin')&&(!object(s.origin)||!keys(s.origin,['templateId','revision','sectionId'])||!name(s.origin.templateId)||!name(s.origin.sectionId)||!Number.isSafeInteger(s.origin.revision)||s.origin.revision<1))fail(p+'.origin');
        }
        if (own(s, 'label') && typeof s.label !== 'string')
            fail(p + '.label');
        if (own(s, 'pageLayoutId') && (!id(s.pageLayoutId) || !object(t.pageLayouts) || !own(t.pageLayouts, s.pageLayoutId)))
            fail(p + '.pageLayoutId');
        if (own(s, 'role') && !['body', 'cover'].includes(s.role))
            fail(p + '.role');
        if (s.role === 'cover' && (i !== 0 || s.source?.kind !== 'authored'))
            fail(p + '.role');
        for (const k of ['headerMode', 'footerMode'])
            if (own(s, k) && !['all', 'first', 'continuation', 'none'].includes(s[k]))
                fail(p + '.' + k);
        const source = s.source;
        if (!object(source)) {
            fail(p + '.source');
            continue;
        }
        if (source.kind === 'blank') {
            if (!keys(source, ['kind']))
                fail(p + '.source');
        }
        else if (source.kind === 'authored') {
            if (!keys(source, ['kind', 'fragment', 'repeats', 'cellRepeats', ...(['rowGroups'])]) || !Array.isArray(source.repeats) || (own(source, 'cellRepeats') && !Array.isArray(source.cellRepeats))) {
                fail(p + '.source');
                continue;
            }
            if (object(t.globalSchema) && object(t.globalSchema.fields) && object(t.styles))
                issues.push(...validateGraph(source.fragment, { sectionIds:t.nodeModelVersion===19?t.sections.map((s:any)=>s.id):undefined, pageBreaks: true, heightModes: true, fixedRootIds: t.nodeModelVersion === 19 || s.role === 'cover' ? source.fragment?.rootIds : [], allowEmptyRoots: true, styles: t.styles, ...({ scopeSchemas: { global: t.globalSchema as TemplateDefinition["globalSchema"], section: s.inputSchema } }), globalSchema: t.globalSchema as TemplateDefinition['globalSchema'], localSchema: { type: 'object', fields: {} }, rowGroups: true, groupLabelSpans:t.nodeModelVersion===19, groupDeclarations: source.rowGroups, repeats: source.repeats, cellRepeats: source.cellRepeats, images: true, merged: true, links: true, contents: true, scopedContents: t.nodeModelVersion===19, cellContent: true, itemImages: true, areas: true }, p + '.source.fragment'));
        }
        else
            fail(p + '.source.kind');
    }
    return issues;
}
