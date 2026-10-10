import {it,expect} from 'vitest';
import {mergedTemplate,mergedDoc} from '../helpers/merged.js';
import {contentsDocument} from '../helpers/contents.js';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';

export function cellTemplate():any {
 const t=mergedTemplate();t.nodeModelVersion=9;
 const f=t.formats.merged;f.inputSchema.fields.photo={type:'image',required:true};
 f.fragment.nodes.pic={id:'pic',type:'image',props:{width:{value:100,unit:'pt'},height:{value:80,unit:'pt'},source:{scope:'local',key:'photo'}}};
 f.fragment.nodes.a.childIds.push('pic');
 f.fragment.nodes.a.props.padding={left:{value:0,unit:'pt'},top:{value:1,unit:'mm'}};
 return t;
}
it('accepts model 9 image children and binds distinct instances with source identity',()=>{
 const input=cellTemplate(),before=structuredClone(input),v=validateTemplate(input);
 expect(v.ok).toBe(true);if(!v.ok)return;
 const p=prepareGeneration(v.value,{docKey:'merged',data:{},content:[{format:'merged',data:{photo:'01a11aa0-c9e6-780a-ae76-834fad559f4d'}},{format:'merged',data:{photo:'01a11aa0-c9e6-780a-ae76-834fad559f4e'}}]});
 expect(p.ok).toBe(true);if(!p.ok)return;
 const r=composeDocument(v.value,p.value);expect(r.ok).toBe(true);if(!r.ok)return;
 expect((r.value.nodes['content-0~a'] as any).childIds).toEqual(['content-0~at','content-0~pic']);
 expect((r.value.nodes['content-0~pic'] as any).props.resourceId).toBe('01a11aa0-c9e6-780a-ae76-834fad559f4d');
 expect((r.value.nodes['content-1~pic'] as any).props.resourceId).toBe('01a11aa0-c9e6-780a-ae76-834fad559f4e');
 expect(r.value.sourceMap['content-1~pic']).toMatchObject({contentIndex:1,sourceId:'pic'});
 expect(validateResolvedDocument(r.value)).toEqual([]);expect(input).toEqual(before);
});
it.each([4,5,6,7,8])('keeps image children and padding outside legacy model %s',version=>{
 const t=cellTemplate();t.nodeModelVersion=version;expect(validateTemplate(t).ok).toBe(false);
});
it.each([null,0,{left:{value:-1,unit:'pt'}},{left:{value:1,unit:'px'}},{left:{value:NaN,unit:'pt'}},{left:{value:Infinity,unit:'pt'}},{wrong:{value:0,unit:'pt'}},{left:0}])('rejects invalid padding %j',padding=>{
 const t=cellTemplate();t.formats.merged.fragment.nodes.a.props.padding=padding;expect(validateTemplate(t).ok).toBe(false);
});
it.each([undefined,{}, {left:{value:0,unit:'pt'}}, {bottom:{value:2,unit:'mm'}}])('accepts default/partial/zero padding %j',padding=>{
 const t=cellTemplate();delete t.formats.merged.fragment.nodes.a.props.padding;
 if(padding!==undefined)t.formats.merged.fragment.nodes.a.props.padding=padding;
 expect(validateTemplate(t).ok).toBe(true);
});
it('accepts implicit cells with padding without mistaking them for explicit spans',()=>{
 const d=mergedDoc();d.nodeModelVersion=9;
 d.nodes.table.rowIds=['header'];d.nodes.header.cellIds=['h'];d.nodes.table.columns=[{width:{value:420,unit:'pt'}}];
 d.nodes={table:d.nodes.table,header:d.nodes.header,h:d.nodes.h,ht:d.nodes.ht};d.nodes.h.props={padding:{left:{value:0,unit:'pt'}}};
 expect(validateResolvedDocument(d)).toEqual([]);
});
it.each(['missing','duplicate','parent','nested'])('rejects bad child topology %s',kind=>{
 const t=cellTemplate(),n=t.formats.merged.fragment.nodes;
 if(kind==='missing')n.a.childIds.push('absent');if(kind==='duplicate')n.a.childIds.push('pic');
 if(kind==='parent')n.b.childIds.push('pic');if(kind==='nested')n.a.childIds.push('table');
 expect(validateTemplate(t).ok).toBe(false);
});
it('retains contents in model 9',()=>{const d=contentsDocument();d.nodeModelVersion=9;expect(validateResolvedDocument(d)).toEqual([]);});
it('rejects padding whose unit conversion overflows',()=>{const t=cellTemplate();t.formats.merged.fragment.nodes.a.props.padding={top:{value:1e308,unit:'mm'}};expect(validateTemplate(t).ok).toBe(false);});
it('rejects padding consuming the complete combined cell width at template validation',()=>{
 const t=cellTemplate();t.formats.merged.fragment.nodes.b.props.padding={left:{value:280,unit:'pt'}};
 const r=validateTemplate(t);expect(r.ok).toBe(false);if(!r.ok)expect(r.issues.some(i=>i.nodeId==='b'&&i.path.includes('padding'))).toBe(true);
});
it('binds a shared global image in repeated rows with independent node identities',()=>{
 const t=cellTemplate(),f=t.formats.merged,n=f.fragment.nodes;
 delete n.a.props.rowSpan;f.fragment.nodes.pic.props.source={scope:'global',key:'photo'};
 t.globalSchema.fields.photo={type:'image',required:true};delete f.inputSchema.fields.photo;
 n.c.props.columnIndex=0;n.e.props.columnIndex=1;n.e.props.colSpan=2;
 f.inputSchema.fields.items={type:'array',items:{type:'object',fields:{text:{type:'string'}}}};
 f.repeats=[{tableId:'table',rowTemplateId:'r1',source:{scope:'local',key:'items'}}];
 const v=validateTemplate(t);expect(v.ok).toBe(true);if(!v.ok)return;
 const p=prepareGeneration(v.value,{docKey:'merged',data:{photo:'01a11aa0-c9e6-780a-ae76-834fad559f4d'},content:[{format:'merged',data:{items:[{text:'A'},{text:'B'}]}}]});
 expect(p.ok).toBe(true);if(!p.ok)return;
 const r=composeDocument(v.value,p.value);expect(r.ok).toBe(true);if(!r.ok)return;
 const pictures=Object.values(r.value.nodes).filter(n=>n.type==='image');expect(pictures).toHaveLength(2);expect(new Set(pictures.map(n=>n.id)).size).toBe(2);
 expect(pictures.map(n=>r.value.sourceMap[n.id]?.itemIndex)).toEqual([0,1]);
});
