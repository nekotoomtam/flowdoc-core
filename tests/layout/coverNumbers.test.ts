import {it,expect} from 'vitest';
import {coverTemplate} from '../helpers/cover.js';
import {composed} from '../helpers/sections.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {collectContents} from '../../src/composition/contents.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';
import {fillPageFields} from '../../src/layout/fillPageFields.js';
it('excludes cover headings while preserving anchors and uses one counted number for TOC and footer',async()=>{
 const t=coverTemplate();Object.assign(t.sections[0].source.fragment.nodes.title.props,{anchorId:'cover',toc:{level:1}});
 t.sections.splice(1,0,{id:'toc',key:'toc',inputSchema:{type:'object',fields:{}},formats:{},source:{kind:'authored',repeats:[],fragment:{rootIds:['toc'],nodes:{toc:{id:'toc',type:'table-of-contents',props:{textStyleId:'body'}}}}}},{id:'blank',key:'blank',inputSchema:{type:'object',fields:{}},formats:{},source:{kind:'blank'}});
 Object.assign(t.areaFormats['section-note'].fragment.nodes.note.props,{anchorId:'body',toc:{level:1}});
 t.areaFormats['section-note'].fragment.nodes.note.children.push({id:'back',type:'reference',text:'Back',target:'cover'});
 t.sections[1].footer=t.sections[3].footer={baseTextStyleId:'body',inputSchema:{type:'object',fields:{}},fragment:{rootIds:['num'],nodes:{num:{id:'num',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'current',type:'system-page-field',field:'current',width:{value:30,unit:'pt'}}]}}}};
 const d=composed(t),draw=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,draw);
 expect(collectContents(d).map(e=>e.anchorId)).toEqual(['body']);expect(anchors.cover?.pageIndex).toBe(0);expect(anchors.body?.pageIndex).toBe(3);
 await fillContentsNumbers(draw,anchors,fakeRuntime);await fillPageFields(draw,fakeRuntime);resolveLinkGeometry(d,draw,anchors);
 expect(draw.pages.map(p=>p.countedPageNumber)).toEqual([null,1,2,3]);
 expect(draw.pages[0]!.commands.some(c=>c.id.startsWith('page-number'))).toBe(false);expect(draw.pages[2]!.commands).toEqual([]);
 expect(draw.pages[1]!.commands.find(c=>c.id==='contents-number-0')?.text).toBe('3');expect(draw.pages[3]!.commands.find(c=>c.id.startsWith('system-page-'))?.text).toBe('3');
 expect(draw.pages[3]!.annotations?.some(a=>a.destination.type==='internal'&&a.destination.target==='cover')).toBe(true);
});
it('omits cover headings inside cells without discarding their anchor',async()=>{
 const t=coverTemplate(),f=t.sections[0].source.fragment;f.rootIds=['table'];f.nodes={table:{id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:50,unit:'mm'}}],rowIds:['row']},row:{id:'row',type:'table-row',props:{allowBreak:true},cellIds:['cell']},cell:{id:'cell',type:'table-cell',props:{},childIds:['heading']},heading:{id:'heading',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',toc:{level:1},anchorId:'cover-cell'},children:[{id:'leaf',type:'text',text:'Cover heading'}]}};
 const d=composed(t),draw=await documentFlow(d,fakeRuntime);expect(collectContents(d)).toEqual([]);expect(indexDestinations(d,draw)['cover-cell']?.pageIndex).toBe(0);
});
