import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
import {cellRepeatTemplate,cellRepeatRequest,photo} from '../helpers/cellRepeats.js';
export const ok=<T>(r:any):T=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
export function compose(t:any=cellRepeatTemplate(),r:any=cellRepeatRequest([{photo,caption:'CAPTION'}])):any{const v:any=ok(validateTemplate(t)),p:any=ok(prepareGeneration(v,r));return ok(composeDocument(v,JSON.parse(JSON.stringify(p))));}
it.each([0,1,3])('replaces range in place for %s items and preserves static siblings',n=>{
 const t=cellRepeatTemplate(),r=cellRepeatRequest(Array.from({length:n},(_,i)=>({photo,caption:'caption '+i}))),before=structuredClone({t,r}),d=compose(t,r);
 const children=d.nodes['content-0~a'].childIds;expect(children).toHaveLength(2+n*2);expect(children[0]).toBe('content-0~at');expect(children.at(-1)).toBe('content-0~footer');
 for(let i=0;i<n;i++){const id=`content-0~repeat-repeat-001~photo~item-${i}`;expect(children[1+i*2]).toBe(id);expect(d.nodes[id].props.resourceId).toBe(photo);expect(d.sourceMap[id]).toEqual({contentIndex:0,format:'merged',sourceId:'photo',itemIndex:i,repeatId:'repeat-001'});}
 expect(d.nodes['content-0~photo']).toBeUndefined();expect(validateResolvedDocument(d)).toEqual([]);expect({t,r}).toEqual(before);expect(compose(t,r)).toEqual(d);
});
it('keeps unique nodes and inline provenance across two cells and content instances',()=>{
 const t=cellRepeatTemplate(),f=t.formats.merged,n=f.fragment.nodes;
 n.b.childIds=['photo2','caption2'];delete n.bt;n.photo2={...structuredClone(n.photo),id:'photo2'};n.caption2=structuredClone(n.caption);n.caption2.id='caption2';n.caption2.children[0].id='caption2-leaf';
 f.cellRepeats.push({id:'repeat-002',cellId:'b',childTemplateIds:['photo2','caption2'],source:{scope:'local',key:'evidenceList'}});
 const r=cellRepeatRequest([{photo,caption:'line1\nline2'},{photo,caption:'next'}]);r.content.push(structuredClone(r.content[0]!));const d=compose(t,r);
 const images=Object.values(d.nodes).filter((n:any)=>n.type==='image');expect(images).toHaveLength(8);
 const ids=[...Object.keys(d.nodes),...Object.values(d.nodes).flatMap((n:any)=>n.children?.map((c:any)=>c.id)??[])];expect(new Set(ids).size).toBe(ids.length);
 for(const id of ids){expect(d.sourceMap[id]).toBeDefined();if(id.includes('~repeat-'))expect(d.sourceMap[id]).toMatchObject({repeatId:expect.any(String),itemIndex:expect.any(Number)});}
 expect(validateResolvedDocument(d)).toEqual([]);
});
it('resolves identical keys from explicit scopes and supports item links/anchors',()=>{
 const t=cellRepeatTemplate(),f=t.formats.merged;t.globalSchema.fields.caption={type:'string'};f.inputSchema.fields.caption={type:'string'};
 f.inputSchema.fields.evidenceList.items.fields.anchor={type:'string'};
 f.fragment.nodes.caption.props.anchorId={scope:'item',key:'anchor'};
 f.fragment.nodes.caption.children=[...['global','local','item'].map(scope=>({id:scope+'-field',type:'field-ref',scope,key:'caption'})),{id:'ref',type:'reference',text:'self',target:{scope:'item',key:'anchor'}}];
 const r:any=cellRepeatRequest([{photo,caption:'I',anchor:'a0'},{photo,caption:'J',anchor:'a1'}]);r.data.caption='G';r.content[0].data.caption='L';
 const d=compose(t,r),b=d.nodes['content-0~repeat-repeat-001~caption~item-0'];expect(b.children.map((c:any)=>c.text)).toEqual(['G','L','I','self']);expect(b.children[3].target).toBe('a0');
 r.content[0].data.evidenceList[1].anchor='a0';const v:any=ok(validateTemplate(t)),p:any=ok(prepareGeneration(v,r));expect(composeDocument(v,p).ok).toBe(false);
});
it('supports image items in existing model10 row repeat without cell nesting',()=>{
 const t=cellRepeatTemplate(),f=t.formats.merged;f.cellRepeats=[];f.fragment.nodes.a.props.rowSpan=1;f.fragment.nodes.table.rowIds=['header','r1'];delete f.fragment.nodes.r2;for(const id of ['c','ct','e','et'])delete f.fragment.nodes[id];
 f.repeats=[{tableId:'table',rowTemplateId:'r1',source:{scope:'local',key:'evidenceList'}}];
 const d=compose(t);expect(d.nodes['content-0~photo~item-0'].props.resourceId).toBe(photo);expect(d.sourceMap['content-0~photo~item-0'].repeatId).toBeUndefined();
});
it('rejects tampered prepared data and sourceMap while keeping old model boundaries',()=>{
 const t:any=ok(validateTemplate(cellRepeatTemplate())),p:any=ok(prepareGeneration(t,cellRepeatRequest([{photo}])));p.content[0].data.evidenceList[0].photo=4;expect(composeDocument(t,p).ok).toBe(false);
 p.content[0].data.evidenceList[0].photo=photo;p.template.fingerprint='wrong';expect(composeDocument(t,p).ok).toBe(false);
 const d=compose();const id='content-0~repeat-repeat-001~photo~item-0';delete d.sourceMap[id].itemIndex;expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
 const old=compose();old.nodeModelVersion=9;expect(validateResolvedDocument(old).length).toBeGreaterThan(0);
});
