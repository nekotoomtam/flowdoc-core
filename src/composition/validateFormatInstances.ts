import {object,keys,name} from '../template/checks.js';
import {isFormatSizing} from '../template/formatSizing.js';
import type {Issue} from '../result.js';
import type {ResolvedDocument} from './resolvedDocument.js';
export function validateFormatInstances(d:ResolvedDocument):Issue[]{
 const issues:Issue[]=[];const fail=(path:string)=>issues.push({code:'LAYOUT_FAILED',path,message:'Invalid Format instance boundary'});
 if(d.formatInstances===undefined)return issues;
 if(![19,20].includes(d.nodeModelVersion)||!Array.isArray(d.formatInstances)){fail('formatInstances');return issues;}
 const identities=new Set<string>(),claimedRoots=new Set<string>(),sectionEnds=new Map<string,number>();
 for(const [i,f] of d.formatInstances.entries()){
  const p=`formatInstances[${i}]`;
  if(!object(f)||!keys(f,['sectionId','areaId','areaEntryIndex','areaFormatId','format','sizing','rootIds','rootStartIndex'])||!(['sectionId','areaId','areaFormatId','format'] as const).every(k=>name(f[k]))||!Number.isSafeInteger(f.areaEntryIndex)||f.areaEntryIndex<0||!isFormatSizing(f.sizing)||!Array.isArray(f.rootIds)||!f.rootIds.every(name)){fail(p);continue;}
  const section=d.sections?.find(s=>s.sectionId===f.sectionId),identity=JSON.stringify([f.sectionId,f.areaId,f.areaEntryIndex]);
  if(!section||identities.has(identity)){fail(p);continue;}identities.add(identity);
  if(f.rootStartIndex!==undefined){
   const at=f.rootStartIndex;
   if(at<(sectionEnds.get(f.sectionId)??0))fail(p+'.rootStartIndex');
   sectionEnds.set(f.sectionId,at+f.rootIds.length);
   if(!Number.isSafeInteger(at)||at<0||at>section.rootIds.length||JSON.stringify(section.rootIds.slice(at,at+f.rootIds.length))!==JSON.stringify(f.rootIds))fail(p+'.rootStartIndex');
   const expected=section.rootIds.filter(id=>{const s=d.sourceMap[id];return s?.areaId===f.areaId&&s.areaEntryIndex===f.areaEntryIndex;});
   if(JSON.stringify(expected)!==JSON.stringify(f.rootIds))fail(p+'.rootIds');
  }else if(f.sizing.mode==='fixed')fail(p+'.rootStartIndex');
  for(const id of f.rootIds){
   const source=d.sourceMap[id];if(claimedRoots.has(id)||!d.nodes[id]||!source||source.sectionId!==f.sectionId||source.areaId!==f.areaId||source.areaEntryIndex!==f.areaEntryIndex||source.areaFormatId!==f.areaFormatId)fail(p+'.rootIds');claimedRoots.add(id);
  }
  const all=Object.entries(d.sourceMap).filter(([,s])=>s.sectionId===f.sectionId&&s.areaId===f.areaId&&s.areaEntryIndex===f.areaEntryIndex);
  if(all.some(([,s])=>s.areaFormatId!==f.areaFormatId))fail(p+'.areaFormatId');
  if(f.sizing.mode==='fixed'&&all.some(([id])=>d.nodes[id]?.type==='table-of-contents'))fail(p+'.sizing');
 }
 return issues;
}
