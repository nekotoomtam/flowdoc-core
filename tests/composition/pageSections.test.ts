import {it,expect} from 'vitest';
import {sectionTemplate,sectionAreaTemplate,valid} from '../helpers/sections.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {composed} from '../helpers/sections.js';
it('composes ordered sections with real provenance and no mutation',()=>{
 const t=sectionTemplate(),before=JSON.stringify(t);t.sections.push({...structuredClone(t.sections[0]),id:'tail',key:'tail'});const unchanged=JSON.stringify(t);
 const d=composed(t);expect(d.sections?.map(s=>s.sectionId)).toEqual(['intro','main','tail']);
 expect(d.rootIds).toEqual(d.sections?.flatMap(s=>s.rootIds));expect(new Set(d.rootIds).size).toBe(d.rootIds.length);
 expect(d.sourceMap[d.rootIds[0]!]!).toMatchObject({origin:'authored',sectionId:'intro',sourceId:'title'});
 expect(d.sourceMap[d.rootIds[0]!]!).not.toHaveProperty('contentIndex');
 expect(d.sourceMap[d.rootIds[1]!]!).toMatchObject({origin:'authored',sectionId:'main',areaEntryIndex:0,areaFormatId:'section-note'});
 expect(validateResolvedDocument(d)).toEqual([]);expect(JSON.stringify(t)).toBe(unchanged);expect(before).not.toBe(unchanged);
 const bad=structuredClone(d);bad.sections![0]!.rootIds=[];expect(validateResolvedDocument(bad).length).toBeGreaterThan(0);
});
it('retains Area entry indices and permits static documents',()=>{
 const d=composed(sectionTemplate(),[{format:'section-note',data:{text:'Body'}}]);
 expect(d.sourceMap[d.rootIds[1]!]!.areaEntryIndex).toBe(0);
 const t=sectionTemplate();t.sections.pop();t.areaFormats={};expect(composed(t,[]).rootIds).toHaveLength(1);
});
it('expands authored Area once and reports truly empty documents',()=>{
 const t=sectionAreaTemplate();t.sections=t.sections.slice(-1);delete t.areaFormats['section-note'];delete t.areaFormats['requirement-list'];const v=valid(t);
 for(const details of [[],[{format:'notice',data:{}}]]){
  const p=prepareGeneration(v,{docKey:t.docKey,data:{projectName:'Demo',details},sections:{}});expect(p.ok).toBe(true);if(!p.ok)continue;
  const r=composeDocument(v,p.value);
  if(!details.length){expect(!r.ok&&r.issues[0]?.code).toBe('EMPTY_CONTENT');continue;}
  expect(r.ok).toBe(true);if(!r.ok)continue;
  expect(r.value.rootIds).toHaveLength(1);expect(validateResolvedDocument(r.value)).toEqual([]);
  expect(r.value.sourceMap[r.value.rootIds[0]!]!).toMatchObject({origin:'authored',sectionId:'appendix',areaId:'area-001',areaEntryIndex:0});
 }
});
