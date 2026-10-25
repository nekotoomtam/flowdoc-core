import {expect,it} from 'vitest';
import {compactSourceWordContainers} from '../../src/docx/source-layout-xml.js';
const shape=(id:number)=>`<v:shape id="fdword${id}" style="margin-left:${id}pt"><v:textbox><w:txbxContent><w:p><w:r><w:t>กี้ ABC</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape>`;
const wrap=(s:string)=>`<w:r><w:pict>${s}</w:pict></w:r>`;
const group=(s:string,tag='approved')=>`<w:sdt><w:sdtPr><w:tag w:val="${tag}"/></w:sdtPr><w:sdtContent>${s}</w:sdtContent></w:sdt>`;
it('shares containers while retaining every complete generated shape in order',()=>{
 const xml=group(`<w:p>${wrap(shape(1))}${wrap(shape(2))}</w:p>`);
 expect(compactSourceWordContainers(xml,new Set(['approved']))).toBe(group(`<w:p>${wrap(shape(1)+shape(2))}</w:p>`));
});
it('leaves non-source groups byte-identical',()=>{const xml=group(`<w:p>${wrap(shape(1))}${wrap(shape(2))}</w:p>`,'other');expect(compactSourceWordContainers(xml,new Set(['approved']))).toBe(xml);});
it('does not join across paragraphs or intervening text',()=>{const xml=group(`<w:p>${wrap(shape(1))}</w:p><w:p>${wrap(shape(2))}<w:r><w:t>X</w:t></w:r>${wrap(shape(3))}</w:p>`);expect(compactSourceWordContainers(xml,new Set(['approved']))).toBe(xml);});
it('is idempotent and preserves shape bodies, ids and source metadata',()=>{const xml=group(`<w:p>${wrap(shape(1))}${wrap(shape(2))}${wrap(shape(3))}</w:p>`);const out=compactSourceWordContainers(xml,new Set(['approved']));expect((out.match(/<w:pict>/g)||[]).length).toBe(1);expect(compactSourceWordContainers(out,new Set(['approved']))).toBe(out);for(const id of [1,2,3])expect(out).toContain(shape(id));});
