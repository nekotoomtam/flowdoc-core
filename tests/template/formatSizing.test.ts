import {it,expect} from 'vitest';
import {validateTemplate} from '../../src/index.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {areaTemplate} from '../helpers/areas.js';
import {sizingTemplate,composeSizing,sizingEntry} from '../helpers/formatSizing.js';
const fixed={mode:'fixed',height:{value:100,unit:'pt'}};
it.each([undefined,{mode:'auto'},fixed,{mode:'fixed',height:{value:20,unit:'mm'}}])('accepts sizing %j only on Format definition',sizing=>{
 expect(validateTemplate(sizingTemplate(sizing)).ok).toBe(true);
});
it.each([null,{}, {mode:'AUTO'},{mode:'auto',height:{value:20,unit:'pt'}},{mode:'fixed'},...[-1,0,NaN,Infinity,'20'].map(value=>({mode:'fixed',height:{value,unit:'pt'}})),{mode:'fixed',height:{value:20,unit:'px'}},{...fixed,width:20}])('rejects malformed sizing %j',sizing=>{
 expect(validateTemplate(sizingTemplate(sizing)).ok).toBe(false);
});
it('preserves independent repeated instance boundaries and source input',()=>{
 const t=sizingTemplate(fixed),entries=[sizingEntry('A'),sizingEntry('B')],before=structuredClone({t,entries});const d=composeSizing(t,entries);
 expect(d.formatInstances).toHaveLength(2);expect(d.formatInstances.map((f:any)=>f.rootStartIndex)).toEqual([0,1]);
 expect(d.formatInstances.map((f:any)=>f.areaEntryIndex)).toEqual([0,1]);expect(d.formatInstances[0].rootIds).not.toEqual(d.formatInstances[1].rootIds);
 expect(d.formatInstances[0]).toMatchObject({sectionId:t.sections[0].id,areaId:'parts',areaFormatId:'panel',format:'panel',sizing:fixed});
 expect(validateResolvedDocument(d)).toEqual([]);expect({t,entries}).toEqual(before);
 const bad=structuredClone(d);bad.formatInstances[1].rootStartIndex=0;expect(validateResolvedDocument(bad).length).toBeGreaterThan(0);
});
it('retains empty invocation boundaries, but no metadata for legacy default',()=>{
 const t=sizingTemplate(fixed);
 const d=composeSizing(t,[sizingEntry(''),sizingEntry('')]);expect(d.formatInstances).toHaveLength(2);expect(d.formatInstances.map((f:any)=>f.rootStartIndex)).toEqual([0,1]);
 expect(validateResolvedDocument(d)).toEqual([]);expect(composeSizing(sizingTemplate()).formatInstances).toBeUndefined();
});
it('rejects a forged empty boundary ordered behind roots already consumed',()=>{
 const d=composeSizing(sizingTemplate(fixed),[sizingEntry('A')]);d.formatInstances.push({...structuredClone(d.formatInstances[0]),areaEntryIndex:1,rootIds:[],rootStartIndex:0});
 expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
it('rejects new sizing in model18, fixed cell contexts, Area props and fixed TOCs',()=>{
 const legacy=areaTemplate();legacy.areaFormats['format-001'].sizing={mode:'auto'};expect(validateTemplate(legacy).ok).toBe(false);
 const cell=areaTemplate();cell.nodeModelVersion=19;cell.sections.forEach((s:any,i:number)=>{delete s.key;delete s.formats;s.id=`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`;s.label='Part'+i;s.nameBase='Part';});
 cell.areaFormats['format-001'].sizing=fixed;expect(validateTemplate(cell).ok).toBe(false);
 cell.areaFormats['format-001'].sizing={mode:'auto'};expect(validateTemplate(cell).ok).toBe(true);
 const area=sizingTemplate();area.sections[0].source.fragment.nodes.parts.props.sizing=fixed;expect(validateTemplate(area).ok).toBe(false);
 const toc=sizingTemplate(fixed);toc.areaFormats.panel.fragment={rootIds:['toc'],nodes:{toc:{id:'toc',type:'table-of-contents',props:{textStyleId:'body',scope:{kind:'section'}}}}};expect(validateTemplate(toc).ok).toBe(false);
});
