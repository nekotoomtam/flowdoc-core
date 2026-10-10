import {readFileSync} from 'node:fs';
const requireText=()=>readFileSync('fixtures/cover-pages/template.json','utf8');
import {it,expect} from 'vitest';
import {sectionTemplate,composed} from '../helpers/sections.js';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {coverTemplate} from '../helpers/cover.js';
it('accepts a direct cover reservation and normalized sections',()=>{const d=composed(coverTemplate());expect(d.sections?.[0]).toMatchObject({role:'cover',sourceKind:'authored'});expect(validateResolvedDocument(d)).toEqual([]);});
it('preserves explicit empty cover and blank without invented nodes',()=>{const t=coverTemplate();t.sections=[t.sections[0],{id:'blank',source:{kind:'blank'}}];t.sections[0].source.fragment={rootIds:[],nodes:{}};t.formats={};const d=composed(t,[]);expect(d.rootIds).toEqual([]);expect(d.sections).toHaveLength(2);expect(validateResolvedDocument(d)).toEqual([]);});
it.each(['duplicate','position','source','height','unit','align','body','legacy','content-height'])('rejects invalid cover %s',mode=>{const t=coverTemplate(),p=t.sections[0].source.fragment.nodes.title.props;if(mode==='duplicate')t.sections.push({...structuredClone(t.sections[0]),id:'other'});if(mode==='position')t.sections.reverse();if(mode==='source')t.sections[0].source={kind:'content'};if(mode==='height')p.height.value=0;if(mode==='unit')p.height.unit='px';if(mode==='align')p.verticalAlign='auto';if(mode==='body')delete t.sections[0].role;if(mode==='legacy')t.nodeModelVersion=12;if(mode==='content-height')p.heightMode='content';expect(validateTemplate(t).ok).toBe(false);});
it('rejects fixed nodes moved out of cover or forged Area provenance',()=>{for(const mode of ['body','area']){const d=composed(coverTemplate()),id=d.rootIds[0]!;if(mode==='body')(d.sections![0] as any).role='body';else Object.assign(d.sourceMap[id]!,{areaId:'a',areaEntryIndex:0,areaFormatId:'f'});expect(validateResolvedDocument(d).length).toBeGreaterThan(0);}});
it.each(['format','area'])('accepts explicit content height in model13 %s formats while fixed stays forbidden',kind=>{
 const t=JSON.parse(requireText());const node=kind==='format'?t.formats.evidence.fragment.nodes.heading:t.areaFormats['format-001'].fragment.nodes.caption;
 node.props.heightMode='content';expect(validateTemplate(t).ok).toBe(true);
 node.props.heightMode='fixed';node.props.height={value:30,unit:'mm'};expect(validateTemplate(t).ok).toBe(false);
});
