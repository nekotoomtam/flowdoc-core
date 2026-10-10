import {it,expect} from 'vitest';
import {validateTemplate} from '../../src/template/validateTemplate.js';
import {prepareGeneration} from '../../src/data/prepareGeneration.js';
import {composeDocument} from '../../src/composition/composeDocument.js';
import {ownedTemplate,ownedRequest} from '../helpers/sectionOwnership.js';
import {areaTemplate} from '../helpers/areas.js';
const ok=(r:any)=>{expect(r.ok,JSON.stringify(r)).toBe(true);return r.value;};
it('keeps repeated format names and skipped indices within their own content section',()=>{
 const t=ownedTemplate();for(const s of t.sections){s.formats={same:{inputSchema:{type:'object',fields:{title:{type:'string',required:true}}},fragment:structuredClone(s.source.fragment),repeats:[]}};s.formats.same.fragment.nodes.title.children.push({id:'local',type:'field-ref',scope:'local',key:'title'});s.source={kind:'content'};}
 const v=ok(validateTemplate(t)),r=ownedRequest(t);for(const key of ['one','two','three'])r.sections[key]={content:[{format:'unknown',data:{}},{format:'same',data:{title:key}}]};
 const p=ok(prepareGeneration(v,r)),d=ok(composeDocument(v,JSON.parse(JSON.stringify(p))));
 expect(d.sections.map((s:any)=>d.nodes[s.rootIds[0]].children.map((c:any)=>c.text).join(''))).toEqual(['Sharedoneone','Sharedtwotwo','Sharedthreethree']);
 const forged=structuredClone(p);forged.sections['id-one'].skippedContentIndices=[];expect(composeDocument(v,forged).ok).toBe(false);
});
it('resolves section images, link labels and section row arrays',()=>{
 const t=ownedTemplate(),s=t.sections[0],f=areaTemplate().formats.merged;
 s.inputSchema.fields.photo={type:'image'};s.inputSchema.fields.rows={type:'array',items:{type:'object',fields:{text:{type:'string'}}}};
 s.source.fragment.nodes.image={id:'image',type:'image',props:{width:{value:30,unit:'pt'},height:{value:30,unit:'pt'},source:{scope:'section',key:'photo'}}};s.source.fragment.rootIds.push('image');
 s.source.fragment.nodes.title.children.push({id:'link',type:'link',text:{scope:'section',key:'title'},url:'https://example.com'});
 // One ordinary row with item binding, without row spans.
 const nodes=f.fragment.nodes;delete nodes.placement;nodes.a.childIds=['at'];delete nodes.a.props.rowSpan;nodes.table.rowIds=['header','r1'];delete nodes.r2;delete nodes.c;delete nodes.ct;delete nodes.e;delete nodes.et;
 nodes.at.children=[{id:'item',type:'field-ref',scope:'item',key:'text'}];Object.assign(s.source.fragment.nodes,nodes);s.source.fragment.rootIds.push('table');s.source.repeats=[{tableId:'table',rowTemplateId:'r1',source:{scope:'section',key:'rows'}}];
 const v=ok(validateTemplate(t)),r=ownedRequest(t);r.sections.one.data.photo='11111111-1111-4111-8111-111111111111';r.sections.one.data.rows=[{text:'item-one'},{text:'item-two'}];const d=ok(composeDocument(v,ok(prepareGeneration(v,r))));expect(d.nodes['section-id-one~image'].props.resourceId).toBe('11111111-1111-4111-8111-111111111111');expect(d.nodes['section-id-one~at~item-1'].children[0].text).toBe('item-two');expect(d.nodes['section-id-one~title'].children[2].text).toBe('FIRST');
});
it('binds section Area with local values and rejects placement in a different section',()=>{
 const t=ownedTemplate(),s=t.sections[0],a=areaTemplate();t.areaFormats=a.areaFormats;s.inputSchema.fields.details=a.formats.merged.inputSchema.fields.details;s.source.fragment.nodes.place={id:'place',type:'area',props:{areaId:'area-001'}};s.source.fragment.rootIds.push('place');t.areaFormats['format-001'].fragment.nodes.text.children.push({id:'sec',type:'field-ref',scope:'section',key:'title'});
 const v=ok(validateTemplate(t)),r=ownedRequest(t);r.sections.one.data.details=[{format:'description',data:{text:'AREA'}}];const d=ok(composeDocument(v,ok(prepareGeneration(v,r))));expect(Object.values(d.nodes).some((n:any)=>n.type==='text-block'&&n.children.map((c:any)=>c.text).join('')==='AREAFIRST')).toBe(true);
 s.source.fragment.rootIds.pop();delete s.source.fragment.nodes.place;t.sections[1].source.fragment.rootIds.push('place');t.sections[1].source.fragment.nodes.place={id:'place',type:'area',props:{areaId:'area-001'}};expect(validateTemplate(t).ok).toBe(false);
});
it('rejects duplicate raw section keys, duplicate identity and illegal body scopes',()=>{
 const t=ownedTemplate();const json=JSON.stringify(t).replace('"key":"one"','"key":"one","key":"two"');expect(validateTemplate(json).ok).toBe(false);t.sections[1].id=t.sections[0].id;expect(validateTemplate(t).ok).toBe(false);t.sections[1].id='id-two';t.sections[0].source.fragment.nodes.title.children[1].scope='header';expect(validateTemplate(t).ok).toBe(false);
});

it('rejects forged repeated placement of document-global Area in scoped prepared content',()=>{
 const t=ownedTemplate(),a=areaTemplate(),s=t.sections[0];t.globalSchema.fields.details=a.formats.merged.inputSchema.fields.details;t.areaFormats=a.areaFormats;s.source={kind:'content'};s.formats={same:{inputSchema:{type:'object',fields:{}},repeats:[],fragment:{rootIds:['area'],nodes:{area:{id:'area',type:'area',props:{areaId:'area-001'}}}}}};
 const v=ok(validateTemplate(t)),r=ownedRequest(t);r.data.details=[{format:'description',data:{text:'ONE'}}];r.sections.one.content=[{format:'same',data:{}}];const p=ok(prepareGeneration(v,r));expect(composeDocument(v,p).ok).toBe(true);const input=p.sections['id-one'];input.content.push({...structuredClone(input.content[0]),originalIndex:1});input.originalContentCount=2;expect(composeDocument(v,p).ok).toBe(false);
});

it('rejects invalid authored Area defaults rather than skipping them at request time',()=>{
 for(const entry of [{format:'TYPO',data:{}},{format:'description',data:{}}]){const t=ownedTemplate(),a=areaTemplate();t.areaFormats=a.areaFormats;t.sections[0].inputSchema.fields.details={...a.formats.merged.inputSchema.fields.details,default:[entry]};t.sections[0].source.fragment.rootIds.push('area');t.sections[0].source.fragment.nodes.area={id:'area',type:'area',props:{areaId:'area-001'}};expect(validateTemplate(t).ok).toBe(false);}
});
