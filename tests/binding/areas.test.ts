import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {areaTemplate} from '../helpers/areas.js';
import {cellRepeatTemplate,photo} from '../helpers/cellRepeats.js';

it('keeps global, entry and repeated item scopes separate inside a root area',()=>{
 const raw=areaTemplate(),sub=cellRepeatTemplate().formats.merged;
 raw.globalSchema.fields.caption={type:'string'};
 raw.formats.merged.inputSchema.fields.caption={type:'string'};
 raw.formats.merged.fragment={rootIds:['placement'],nodes:{placement:{id:'placement',type:'area',props:{areaId:'area-001'}}}};
 sub.inputSchema.fields.caption={type:'string',required:true};
 sub.fragment.nodes.caption.children=['global','local','item'].map(scope=>({id:scope+'-leaf',type:'field-ref',scope,key:'caption'}));
 raw.areaFormats={'format-repeat':{...sub,key:'repeated',ownerAreaId:'area-001'}};
 const t=validateTemplate(raw);expect(t.ok,JSON.stringify(t)).toBe(true);if(!t.ok)return;
 const request={docKey:'merged',data:{caption:'GLOBAL'},content:[{format:'merged',data:{caption:'HOST',details:[
  {format:'repeated',data:{caption:'ENTRY',evidenceList:[{photo,caption:'ITEM-A'},{photo,caption:'ITEM-B'}]}},
  {format:'repeated',data:{evidenceList:[]}}
 ]}}]};
 const p=prepareGeneration(t.value,request);expect(p.ok,JSON.stringify(p)).toBe(true);if(!p.ok)return;
 expect(p.warnings.some(w=>w.path==='content[0].data.details[1].data.caption')).toBe(true);
 const d=composeDocument(t.value,JSON.parse(JSON.stringify(p.value)));expect(d.ok,JSON.stringify(d)).toBe(true);if(!d.ok)return;
 const blocks=Object.entries(d.value.nodes).filter(([id,n])=>n.type==='text-block'&&d.value.sourceMap[id]?.repeatId==='repeat-001');
 expect(blocks.map(([,n])=>(n as any).children.map((c:any)=>c.text))).toEqual([['GLOBAL','ENTRY','ITEM-A'],['GLOBAL','ENTRY','ITEM-B']]);
 for(const [id,n] of blocks){expect(d.value.sourceMap[id]).toMatchObject({areaId:'area-001',areaEntryIndex:0,areaFormatId:'format-repeat',repeatId:'repeat-001'});for(const c of (n as any).children)expect(d.value.sourceMap[c.id]).toMatchObject({areaId:'area-001',areaEntryIndex:0,repeatId:'repeat-001'});}
 expect(Object.values(d.value.nodes).filter(n=>n.type==='image')).toHaveLength(2);
});
it('isolates outer occurrences and keeps static siblings',()=>{const t=validateTemplate(areaTemplate());if(!t.ok)throw Error('template');const req={docKey:'merged',data:{},content:['FIRST','SECOND'].map(text=>({format:'merged',data:{details:[{format:'description',data:{text}}]}}))};const p=prepareGeneration(t.value,req);expect(p.ok).toBe(true);if(!p.ok)return;const r=composeDocument(t.value,p.value);expect(r.ok).toBe(true);if(!r.ok)return;const entries=Object.entries(r.value.sourceMap).filter(([id,s])=>(s as any).areaId&&r.value.nodes[id]?.type==='text-block');expect(entries.length).toBe(2);expect(entries.map(([id])=>(r.value.nodes[id] as any).children[0].text)).toEqual(['FIRST','SECOND']);expect(Object.values(r.value.nodes).some((n:any)=>n.type==='area')).toBe(false);expect(composeDocument(t.value,p.value)).toEqual(r);});
it('rejects tampered persisted area identities and partition',()=>{const t=validateTemplate(areaTemplate());if(!t.ok)throw Error('template');const p=prepareGeneration(t.value,{docKey:'merged',data:{},content:[{format:'merged',data:{details:[{format:'notice',data:{}},{format:'bad',data:{}}]}}]});expect(p.ok).toBe(true);if(!p.ok)return;for(const mutate of [(a:any)=>a.entries[0].formatId='wrong',(a:any)=>a.entries[0].originalIndex=1,(a:any)=>a.originalCount=9,(a:any)=>a.skippedIndices=[]]){const v=structuredClone(p.value);mutate(v.content[0]!.data.details);expect(composeDocument(t.value,v).ok).toBe(false);}});

it('empty area removes only placement and global occurrence cannot duplicate',()=>{const raw=areaTemplate(),t=validateTemplate(raw);if(!t.ok)throw Error('template');let req:any={docKey:'merged',data:{},content:[{format:'merged',data:{details:[]}}]};const p=prepareGeneration(t.value,req);if(!p.ok)throw Error('prepare');const d=composeDocument(t.value,p.value);expect(d.ok).toBe(true);if(d.ok)expect((d.value.nodes['content-0~a'] as any).childIds).toEqual(['content-0~at']);raw.globalSchema.fields.details=raw.formats.merged.inputSchema.fields.details;delete raw.formats.merged.inputSchema.fields.details;const g=validateTemplate(raw);if(!g.ok)throw Error('global template');req={docKey:'merged',data:{details:[]},content:[{format:'merged',data:{}},{format:'merged',data:{}}]};expect(prepareGeneration(g.value,req).ok).toBe(false);});
it('rejects removed skip warnings and invalid accepted data',()=>{const t=validateTemplate(areaTemplate());if(!t.ok)throw Error('template');const p=prepareGeneration(t.value,{docKey:'merged',data:{},content:[{format:'merged',data:{details:[{format:'description',data:{text:'OK'}},{format:'bad',data:{}}]}}]});if(!p.ok)throw Error('prepare');const a=structuredClone(p.value);a.warnings=[];expect(composeDocument(t.value,a).ok).toBe(false);const b:any=structuredClone(p.value);b.content[0].data.details.entries[0].data.text=3;expect(composeDocument(t.value,b).ok).toBe(false);});
