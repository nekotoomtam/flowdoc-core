import {it, expect} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {fonts, noImages, staged} from './helpers.js';

const sectionId = '00000000-0000-4000-8000-000000000001';
// Exact plain-text workload from the isolated Oracle storage comparison.
const message = (n: number) => 'Record ' + n + ' — audit ownership text ' + ('bounded input ' + n + ' ').repeat(8);
function template(children: unknown[] = [{id: 'leaf', type: 'field-ref', scope: 'local', key: 'message'}]): any {
    const mm = {value: 20, unit: 'mm'};
    return {
        schemaVersion: 1, nodeModelVersion: 19, templateId: 'audit-fixture', docKey: 'audit-fixture', version: 1, name: 'audit-fixture', examples: [],
        book: {contentSlot: 'body', defaultPageLayoutId: 'normal'}, globalSchema: {type: 'object', fields: {}},
        styles: {body: {fontFamilyKey: 'sarabun', fontWeight: 'normal', fontSize: {value: 12, unit: 'pt'}, lineHeightPt: 20}},
        pageLayouts: {normal: {page: {size: 'A4', orientation: 'portrait', margin: {top: mm, right: mm, bottom: mm, left: mm}}}},
        areaFormats: {item: {key: 'item', ownerAreaId: 'parts', inputSchema: {type: 'object', fields: {message: {type: 'string', required: true}}}, repeats: [], fragment: {rootIds: ['text'], nodes: {text: {id: 'text', type: 'text-block', role: {role: 'paragraph'}, props: {textStyleId: 'body'}, children}}}}},
        sections: [{id: sectionId, label: 'Audit', nameBase: 'Audit', inputSchema: {type: 'object', fields: {parts: {type: 'area', areaId: 'parts'}}}, source: {kind: 'authored', repeats: [], fragment: {rootIds: ['parts'], nodes: {parts: {id: 'parts', type: 'area', props: {areaId: 'parts'}}}}}}],
    };
}
async function generate(messages: string[], children?: unknown[]) {
    const validated = api.validateTemplate(template(children));
    if (!validated.ok) throw Error(JSON.stringify(validated));
    const prepared = api.prepareGeneration(validated.value, {docKey: 'audit-fixture', data: {}, sections: [{id: sectionId, data: {parts: messages.map(message => ({format: 'item', data: {message}}))}}]});
    if (!prepared.ok) throw Error(JSON.stringify(prepared));
    const composed = api.composeDocument(validated.value, prepared.value);
    if (!composed.ok) throw Error(JSON.stringify(composed));
    const before = JSON.stringify(composed.value), engine = await api.createDocxEngine(fonts()), sink = staged();
    if (!engine.ok) throw Error(JSON.stringify(engine));
    const result = await engine.value.generateDocxTo(composed.value, noImages, sink.output);
    expect(JSON.stringify(composed.value)).toBe(before);
    return {result, sink};
}
const nodeCount = (xml: string) => (xml.match(/<(?![!?/])[A-Za-z_][\w:.-]*(?=[\s/>])/g) ?? []).length;
const texts = (xml: string) => [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map(m => m[1]!).join('');

it('delivers all 1800 plain-text records within the original all-part XML and byte budgets', async () => {
    const {result, sink} = await generate(Array.from({length: 1800}, (_, n) => message(n)));
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(sink.aborts).toEqual([]);
    const bytes = Buffer.concat(sink.chunks);
    expect(bytes.length).toBeLessThanOrEqual(32 * 1024 * 1024);
    const zip = await JSZip.loadAsync(bytes);
    let nodes = 0, drawings = 0;
    for (const name of Object.keys(zip.files).filter(n => /\.(xml|rels)$/.test(n))) {
        const xml = await zip.file(name)!.async('string');
        nodes += nodeCount(xml); drawings += (xml.match(/<wp:docPr\b/g) ?? []).length;
    }
    expect(nodes).toBeLessThanOrEqual(50000);
    expect(drawings).toBe(0);
    const xml = await zip.file('word/document.xml')!.async('string');
    const paragraphs = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map(m => m[0]);
    expect(paragraphs.map(texts)).toEqual(Array.from({length: 1800}, (_, n) => message(n)));
    expect(xml).toContain('w:ascii="Sarabun"');
    expect(xml).toContain('w:line="400" w:lineRule="atLeast"');
    if (result.ok) expect(result.value.adaptations.some((a: any) => a.wordVerified === true)).toBe(false);
}, 60000);

it('retains authored span and line-break boundaries and whitespace', async () => {
    const {result, sink} = await generate(['unused'], [
        {id: 'first', type: 'text', text: 'A 12 — '},
        {id: 'second', type: 'text', text: 'B 34'},
        {id: 'break', type: 'line-break'},
        {id: 'third', type: 'text', text: ' C 56 '},
    ]);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const zip = await JSZip.loadAsync(Buffer.concat(sink.chunks)), xml = await zip.file('word/document.xml')!.async('string');
    expect(texts(xml)).toBe('A 12 — B 34 C 56 ');
    expect(xml.match(/<w:br\/>/g)).toHaveLength(1);
    expect(xml).toContain('xml:space="preserve">A 12 — </w:t>');
    expect(xml).toContain('xml:space="preserve">B 34</w:t>');
    expect(xml).toContain('xml:space="preserve"> C 56 </w:t>');
});

it('keeps Thai runs separate from adjacent Latin/Common text', async () => {
    const {result, sink} = await generate(['A 12 ไทย 34 B']);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const zip = await JSZip.loadAsync(Buffer.concat(sink.chunks)), xml = await zip.file('word/document.xml')!.async('string');
    expect(texts(xml)).toBe('A 12 ไทย 34 B');
    const thai = (xml.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? []).filter(r => r.includes('ไทย'));
    expect(thai).toHaveLength(1);
    expect(thai[0]).toContain('<w:cs/>');
    expect(thai[0]).not.toContain('A 12');
    expect(thai[0]).not.toContain('34 B');
});
