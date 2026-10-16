import {mergedTemplate} from './merged.js';
export function areaTemplate():any {
 const t=mergedTemplate();t.nodeModelVersion=18;
 const f=t.areaFormats.merged;t.sections[0].source={kind:'authored',fragment:f.fragment,repeats:[]};t.sections[0].inputSchema=f.inputSchema;f.inputSchema.fields.details={type:'area',areaId:'area-001'};
 f.fragment.nodes.a.childIds.push('placement');
 f.fragment.nodes.placement={id:'placement',type:'area',props:{areaId:'area-001'}};
 t.areaFormats={'format-001':{key:'description',ownerAreaId:'area-001',inputSchema:{type:'object',fields:{text:{type:'string',required:true}}},fragment:{rootIds:['text'],nodes:{text:{id:'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'leaf',type:'field-ref',scope:'local',key:'text'}]}}},repeats:[]},'format-002':{key:'notice',ownerAreaId:'area-001',inputSchema:{type:'object',fields:{}},fragment:{rootIds:['text'],nodes:{text:{id:'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'leaf',type:'text',text:'NOTICE'}]}}},repeats:[]}};return t;
}
