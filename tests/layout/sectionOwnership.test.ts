import {it,expect} from 'vitest';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
import {fakeRuntime} from '../helpers/document.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
const compose=(t:any,r=ownedRequest(t))=>{const v=ok(validateTemplate(t));return ok(composeDocument(v,ok(prepareGeneration(v,r))));};
it('uses section band identity even with equal widths and contains scoped images',async()=>{
 const t=ownedTemplate(),r=ownedRequest(t),images:any={};for(const [i,s] of t.sections.entries()){s.header.inputSchema.fields.photo={type:'image'};s.header.fragment.nodes.pic={id:'pic',type:'image',props:{width:{value:20,unit:'pt'},height:{value:20,unit:'pt'},source:{scope:'header',key:'photo'}}};s.header.fragment.rootIds.push('pic');const id=`11111111-1111-4111-8111-11111111111${i}`;images[id]={width:100,height:100};r.sections[s.key]={header:{title:'HEADER-'+s.key,photo:id}};s.header.gap={value:8,unit:'pt'};}
 const draw=await documentFlow(compose(t,r),fakeRuntime,images);expect(draw.pages).toHaveLength(3);for(const [i,p] of draw.pages.entries()){expect(p.commands.filter(c=>c.id.startsWith('header')).map(c=>c.text).join('')).toBe('HEADER-'+t.sections[i].key+'Shared');expect(p.images?.[0]?.resourceId).toBe(`11111111-1111-4111-8111-11111111111${i}`);expect(p.commands.find(c=>!c.id.startsWith('header'))!.bounds.yPt).toBeGreaterThan(p.commands[0]!.bounds.yPt+30);}
 expect(draw.pages[1]!.widthPt).toBeGreaterThan(draw.pages[0]!.widthPt);
});
it('applies continuation modes separately and excludes cover/blank',async()=>{
 const t=ownedTemplate();t.sections[0].role='cover';t.sections[2].source={kind:'blank'};t.sections[1].headerMode='continuation';const r=ownedRequest(t);r.sections.two.data.title=Array(100).fill('BODY').join('\n');const draw=await documentFlow(compose(t,r),fakeRuntime);expect(draw.pages.length).toBeGreaterThan(4);for(const p of draw.pages){const has=p.commands.some(c=>c.id.startsWith('header'));expect(has).toBe(p.sectionId==='id-two'&&p.sectionPageIndex!>0);}
});
it('retains band overflow and combined 40 percent bounds',async()=>{
 const t=ownedTemplate();t.sections[0].header.sizing={mode:'fixed',height:{value:300,unit:'pt'}};await expect(documentFlow(compose(t),fakeRuntime)).rejects.toThrow(/40 percent/);t.sections[0].header.sizing={mode:'fixed',height:{value:20,unit:'pt'}};const r=ownedRequest(t);r.sections.one.header={title:'first\nsecond\nthird'};await expect(documentFlow(compose(t,r),fakeRuntime)).rejects.toThrow();
});
