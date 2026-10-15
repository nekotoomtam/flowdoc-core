import {it,expect} from 'vitest';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {areaTemplate} from '../helpers/areas.js';
import {cellRepeatTemplate,photo} from '../helpers/cellRepeats.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
const request=(details:any[],data:any={})=>({docKey:'merged',data,sections:{main:{data:{details}}}});
it('rejects wrong-type Area entries with indexed type diagnostics',()=>{const t=ok(validateTemplate(areaTemplate())),p=prepareGeneration(t,request([{format:'description',data:{text:3}},{format:'notice',data:{}}]));expect(p.ok).toBe(false);if(!p.ok)expect(p.issues[0]).toMatchObject({path:'sections.main.data.details[0].data.text',expectedType:'string',actualType:'number'});});
it('keeps global, entry and repeated item scopes separate inside a root Area',()=>{
 const raw=areaTemplate(),sub=cellRepeatTemplate().areaFormats.merged;
 raw.globalSchema.fields.caption={type:'string'};raw.sections[0].inputSchema.fields.caption={type:'string',default:'HOST'};
 raw.sections[0].source.fragment={rootIds:['placement'],nodes:{placement:{id:'placement',type:'area',props:{areaId:'area-001'}}}};
 sub.inputSchema.fields.caption={type:'string',required:true};sub.fragment.nodes.caption.children=['global','local','item'].map(scope=>({id:scope+'-leaf',type:'field-ref',scope,key:'caption'}));
 raw.areaFormats={'format-repeat':{...sub,key:'repeated',ownerAreaId:'area-001'}};
 const t=ok(validateTemplate(raw)),p=ok(prepareGeneration(t,request([{format:'repeated',data:{caption:'ENTRY',evidenceList:[{photo,caption:'ITEM-A'},{photo,caption:'ITEM-B'}]}}],{caption:'GLOBAL'})));
 const d=ok(composeDocument(t,JSON.parse(JSON.stringify(p))));
 const blocks=Object.entries(d.nodes).filter(([id,n]:any)=>n.type==='text-block'&&d.sourceMap[id]?.repeatId==='repeat-001');
 expect(blocks.map(([,n]:any)=>n.children.map((c:any)=>c.text))).toEqual([['GLOBAL','ENTRY','ITEM-A'],['GLOBAL','ENTRY','ITEM-B']]);
 for(const [id,n] of blocks as any){expect(d.sourceMap[id]).toMatchObject({areaId:'area-001',areaEntryIndex:0,areaFormatId:'format-repeat',repeatId:'repeat-001'});for(const c of n.children)expect(d.sourceMap[c.id]).toMatchObject({areaId:'area-001',areaEntryIndex:0,repeatId:'repeat-001'});}
 expect(Object.values(d.nodes).filter((n:any)=>n.type==='image')).toHaveLength(2);
});
it('isolates repeated Area entries and keeps static siblings',()=>{
 const t=ok(validateTemplate(areaTemplate())),p=ok(prepareGeneration(t,request(['FIRST','SECOND'].map(text=>({format:'description',data:{text}}))))),r=ok(composeDocument(t,p));
 const entries=Object.entries(r.sourceMap).filter(([id,s]:any)=>s.areaId&&r.nodes[id]?.type==='text-block');expect(entries).toHaveLength(2);expect(entries.map(([id])=>r.nodes[id].children[0].text)).toEqual(['FIRST','SECOND']);expect(Object.values(r.nodes).some((n:any)=>n.type==='area')).toBe(false);expect(ok(composeDocument(t,p))).toEqual(r);
});
it('rejects tampered persisted Area identities and index coverage',()=>{
 const t=ok(validateTemplate(areaTemplate())),p=ok(prepareGeneration(t,request([{format:'notice',data:{}}])));
 for(const mutate of [(a:any)=>a.entries[0].formatId='wrong',(a:any)=>a.entries[0].originalIndex=1,(a:any)=>a.originalCount=9,(a:any)=>a.skippedIndices=[0]]){const v=structuredClone(p);mutate(v.sections.main.data.details);expect(composeDocument(t,v).ok).toBe(false);}
});
it('empty Area removes only its placement and global placement cannot duplicate',()=>{
 const raw=areaTemplate(),t=ok(validateTemplate(raw)),p=ok(prepareGeneration(t,request([]))),d=ok(composeDocument(t,p));expect(d.nodes['section-main~a'].childIds).toEqual(['section-main~at']);
 raw.globalSchema.fields.details=raw.sections[0].inputSchema.fields.details;delete raw.sections[0].inputSchema.fields.details;
 expect(validateTemplate(raw).ok).toBe(true);const duplicate=structuredClone(raw.sections[0]);duplicate.id=duplicate.key='other';raw.sections.push(duplicate);expect(validateTemplate(raw).ok).toBe(false);
});
it('rejects forged skip warnings and invalid accepted data',()=>{
 const t=ok(validateTemplate(areaTemplate())),p=ok(prepareGeneration(t,request([{format:'description',data:{text:'OK'}}])));
 const a=structuredClone(p);a.warnings=[{code:'AREA_ENTRY_SKIPPED',path:'sections.main.data.details[0]',message:'skip',action:'skipped'}];expect(composeDocument(t,a).ok).toBe(false);
 const b=structuredClone(p);b.sections.main.data.details.entries[0].data.text=3;expect(composeDocument(t,b).ok).toBe(false);
});
