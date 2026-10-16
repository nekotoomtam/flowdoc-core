import {it,expect} from 'vitest';
import {scopedTemplate,scopedRequest,composeScoped,sid} from '../helpers/scopedContents.js';
import {fakeRuntime} from '../helpers/document.js';
import {validateTemplate} from '../../src/index.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {collectContents} from '../../src/composition/contents.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';
it('collects separate Section headings while permitting one whole-document TOC',async()=>{
 const d=composeScoped(scopedTemplate(3,true));expect(validateResolvedDocument(d)).toEqual([]);
 expect(collectContents(d,sid(1)).map(e=>e.title)).toEqual(['Alpha H000 หัวข้อทดสอบ','Alpha H001 หัวข้อทดสอบ','Alpha H002 หัวข้อทดสอบ']);
 const draw=await documentFlow(d,fakeRuntime),nodes=d.nodes,slots=draw.contentsSlots!;
 const tocIds=d.rootIds.filter(id=>nodes[id]?.type==='table-of-contents');expect(tocIds).toHaveLength(3);
 expect(tocIds.map(id=>slots.filter(s=>s.nodeId===id).length)).toEqual([6,3,3]);
 const anchors=indexDestinations(d,draw);await fillContentsNumbers(draw,anchors,fakeRuntime,true);resolveLinkGeometry(d,draw,anchors);
 for(const id of tocIds){const runs=draw.pages.flatMap(p=>p.commands).filter(c=>c.nodeId===id&&!c.id.startsWith('contents-number-'));const scope=(nodes[id] as any).props.scope.kind;if(scope==='section')expect(runs.every(c=>c.text.startsWith(d.sourceMap[id]!.sectionId===sid(1)?'Alpha':'Beta'))).toBe(true);}
});
it('rejects missing/unknown scope, duplicate scope and model18 scope extensions',()=>{
 for(const scope of [undefined,{}, {kind:'other'}, {kind:'section',sectionId:sid(2)}]){const t=scopedTemplate();t.sections[0].source.fragment.nodes.toc.props.scope=scope;if(scope===undefined)delete t.sections[0].source.fragment.nodes.toc.props.scope;expect(validateTemplate(t).ok).toBe(false);}
 for(const kind of ['section','document']){const t=scopedTemplate();const f=t.sections[0].source.fragment;f.nodes.toc.props.scope.kind=kind;f.nodes.second={...structuredClone(f.nodes.toc),id:'second'};f.rootIds.push('second');expect(validateTemplate(t).ok).toBe(false);}
 const t=scopedTemplate();t.nodeModelVersion=18;t.sections.forEach((s:any,i:number)=>{s.id='s'+i;s.key='s'+i;s.formats={};delete s.label;delete s.nameBase;});expect(validateTemplate(t).ok).toBe(false);
});
it('rejects duplicate document TOCs across different Sections after composition',()=>{
 const t=scopedTemplate();t.sections.forEach((s:any)=>s.source.fragment.nodes.toc.props.scope.kind='document');expect(validateTemplate(t).ok).toBe(true);expect(()=>composeScoped(t)).toThrow(/contents|scope/i);
});
it('does not manufacture a page for an empty Section scope, including surrounding breaks',async()=>{
 const t=scopedTemplate();const f=t.sections[0].source.fragment;f.rootIds=['break','toc','tail'];f.nodes={break:f.nodes.break,toc:f.nodes.toc,tail:{id:'tail',type:'page-break'}};
 const d=composeScoped(t),draw=await documentFlow(d,fakeRuntime);expect(draw.pages.every(p=>p.sectionId===sid(2))).toBe(true);expect(draw.pages[0]!.countedPageNumber).toBe(7);
});
it('keeps Area-inserted TOCs owned by their Section and rejects duplicated expanded scopes',async()=>{
 const t=scopedTemplate(),s=t.sections[0],f=s.source.fragment,toc=f.nodes.toc;
 s.inputSchema.fields.parts={type:'area',areaId:'contents-area'};
 f.nodes.toc={id:'toc',type:'area',props:{areaId:'contents-area'}};
 t.areaFormats.contents={key:'contents',ownerAreaId:'contents-area',inputSchema:{type:'object',fields:{}},repeats:[],fragment:{rootIds:['toc'],nodes:{toc}}};
 const r=scopedRequest(t);r.sections[0].data.parts=[{format:'contents',data:{}}];
 const d=composeScoped(t,r),draw=await documentFlow(d,fakeRuntime),nodeId=d.rootIds[0]!;
 expect(d.sourceMap[nodeId]!.areaId).toBe('contents-area');expect(draw.contentsSlots!.filter(s=>s.nodeId===nodeId)).toHaveLength(3);
 r.sections[0].data.parts.push({format:'contents',data:{}});expect(()=>composeScoped(t,r)).toThrow(/scope/);
});
it('rejects forged resolved scopes and an entirely empty scoped-TOC document',async()=>{
 const d=composeScoped(scopedTemplate());delete (d.nodes[d.rootIds[0]!] as any).props.scope;expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
 const t=scopedTemplate();for(const s of t.sections){s.source.fragment={rootIds:['toc'],nodes:{toc:s.source.fragment.nodes.toc}};}
 await expect(documentFlow(composeScoped(t),fakeRuntime)).rejects.toThrow(/No layout content/);
});
it.each(['continue','restart','exclude'])('fills target numbers for %s after multipage TOC, reorder and content changes',async mode=>{
 const t=scopedTemplate(38,true);t.sections.reverse();t.sections[0].numbering=mode==='restart'?{mode,startAt:12,visibility:'hide'}:{mode};
 const request=scopedRequest(t);request.sections.reverse();const d=composeScoped(t,request),draw=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,draw),slots=structuredClone(draw.contentsSlots!);
 const toc=t.sections[0].id;const local=slots.filter(s=>s.nodeId.includes(toc)&&!(d.nodes[s.nodeId] as any).props.scope.kind.includes('document'));
 expect(new Set(local.map(s=>s.pageIndex)).size).toBeGreaterThan(1);
 const before=draw.pages.map(p=>structuredClone(p.commands));await fillContentsNumbers(draw,anchors,fakeRuntime,true);resolveLinkGeometry(d,draw,anchors);
 draw.pages.forEach((p,i)=>expect(p.commands.slice(0,before[i]!.length)).toEqual(before[i]));
 slots.forEach((s,i)=>{const target=anchors[s.anchorId]!,page=draw.pages[target.pageIndex]!,run=draw.pages[s.pageIndex]!.commands.find(c=>c.id==='contents-number-'+i);if(page.countedPageNumber===null)expect(run).toBeUndefined();else expect(run!.text).toBe(String(page.countedPageNumber));expect(draw.pages[s.pageIndex]!.annotations!.some(a=>a.destination.type==='internal'&&a.destination.target===s.anchorId)).toBe(true);});
});
