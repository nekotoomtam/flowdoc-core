import {it,expect} from 'vitest';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
export const numbered=()=>{const t=ownedTemplate();t.nodeModelVersion=16;t.sections[0].header.fragment.nodes.head.children.push({id:'number',type:'system-page-field',field:'current',width:{value:24,unit:'pt'}});return t;};
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
it('preserves system fields without requiring caller values',()=>{const t=numbered(),v=ok(validateTemplate(t)),p=ok(prepareGeneration(v,ownedRequest(t))),d=ok(composeDocument(v,JSON.parse(JSON.stringify(p))));expect(d.sections[0].header.nodes['section-id-one~band-header~head'].children.at(-1).field).toBe('current');});
it('rejects malformed policy, misplaced and legacy fields',()=>{for(const change of [(t:any)=>t.nodeModelVersion=15,(t:any)=>t.sections[0].numbering={mode:'exclude'},(t:any)=>t.sections[0].numbering={mode:'restart',startAt:0},(t:any)=>t.sections[0].numbering={mode:'continue',startAt:1},(t:any)=>t.sections[0].header.fragment.nodes.head.children.at(-1).width.value=0,(t:any)=>t.sections[0].source.fragment.nodes.title.children.push(t.sections[0].header.fragment.nodes.head.children.pop())]){const t=numbered();change(t);expect(validateTemplate(t).ok).toBe(false);}});

