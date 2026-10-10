import {it,expect} from 'vitest';
import {sectionTemplate,sectionAreaTemplate,composed} from '../helpers/sections.js';
import {fakeRuntime} from '../helpers/document.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {indexDestinations,resolveLinkGeometry} from '../../src/layout/linkGeometry.js';
import {fillContentsNumbers} from '../../src/layout/fillContentsNumbers.js';
it('starts sections on new pages with independent dimensions and no duplicate text',async()=>{
 const t=sectionTemplate();t.sections.push({...structuredClone(t.sections[0]),id:'tail'});
 const d=composed(t),r=await documentFlow(d,fakeRuntime);
 expect(r.pages).toHaveLength(3);expect(r.pages.map(p=>p.sectionId)).toEqual(['intro','main','tail']);
 expect(r.pages.map(p=>p.sectionPageIndex)).toEqual([0,0,0]);
 expect(r.pages[1]!.widthPt).toBeGreaterThan(r.pages[0]!.widthPt);
 expect(r.pages.flatMap(p=>p.commands).map(c=>c.text)).toEqual(['Demo','โครงการ Demo: Body','Demo']);
});
it('uses global contents and cross-section destinations',async()=>{
 const t=sectionTemplate();const f=t.sections[0].source.fragment;
 f.rootIds=['toc'];f.nodes={toc:{id:'toc',type:'table-of-contents',props:{textStyleId:'body'}}};
 t.formats['section-note'].fragment.nodes.note.props.anchorId='target';t.formats['section-note'].fragment.nodes.note.props.toc={level:1};
 const d=composed(t),draw=await documentFlow(d,fakeRuntime),anchors=indexDestinations(d,draw);
 await fillContentsNumbers(draw,anchors,fakeRuntime);resolveLinkGeometry(d,draw,anchors);
 expect(anchors.target?.pageIndex).toBe(1);
 expect(draw.pages[0]!.commands.some(c=>c.text==='โครงการ Demo: Body')).toBe(true);
 expect(draw.pages[0]!.commands.some(c=>c.text==='2')).toBe(true);
});
it('skips empty sections at middle/end and keeps continuation metadata',async()=>{
 const t=sectionAreaTemplate();t.sections.splice(1,0,{...structuredClone(t.sections[2]),id:'empty-middle',source:{kind:'authored',repeats:[],fragment:{rootIds:[],nodes:{}}}});
 const r=await documentFlow(composed(t,[{format:'section-note',data:{text:Array.from({length:90},(_,i)=>'L'+i).join('\n')}}]),fakeRuntime);
 expect(r.pages[0]!.sectionId).toBe('intro');expect(r.pages.slice(1).every(p=>p.sectionId==='main')).toBe(true);
 expect(r.pages.slice(1).map(p=>p.sectionPageIndex)).toEqual(r.pages.slice(1).map((_,i)=>i));
 expect(r.pages.flatMap(p=>p.commands).filter(c=>/^L\d+$/.test(c.text)).map(c=>c.text)).toEqual(Array.from({length:89},(_,i)=>'L'+(i+1)));
});
it('flows a long table then authored image and reports oversized image',async()=>{
 const t=sectionTemplate();t.globalSchema.fields.photo={type:'image'};
 t.globalSchema.fields.photo.default='11111111-1111-4111-8111-111111111111';
 t.sections.push({id:'images',source:{kind:'authored',repeats:[],fragment:{rootIds:['photo'],nodes:{photo:{id:'photo',type:'image',props:{source:{scope:'global',key:'photo'},width:{value:80,unit:'mm'},height:{value:30,unit:'mm'},align:'center'}}}}}});
 const d=composed(t,[{format:'requirement-list',data:{items:[{code:'REQ-01',detail:Array.from({length:70},(_,i)=>'ROW'+i).join('\n')}]}}]);
 const r=await documentFlow(d,fakeRuntime);expect(r.pages.length).toBeGreaterThan(3);expect(r.pages.at(-1)?.sectionId).toBe('images');
 expect(r.pages.filter(p=>p.sectionId==='main').every(p=>p.borders?.length)).toBe(true);
 const n=Object.values(d.nodes).find(n=>n.type==='image')!;if(n.type!=='image')return;n.props.height.value=500;
 await expect(documentFlow(d,fakeRuntime)).rejects.toMatchObject({nodeId:n.id});
});
