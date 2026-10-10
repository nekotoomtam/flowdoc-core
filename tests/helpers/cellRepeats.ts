import {mergedTemplate} from './merged.js';
export const photo='22222222-2222-4222-8222-222222222222';
export function cellRepeatTemplate():any {
 const t=mergedTemplate();t.nodeModelVersion=10;
 const f=t.formats.merged,n=f.fragment.nodes;
 f.inputSchema.fields.evidenceList={type:'array',items:{type:'object',fields:{photo:{type:'image',required:true},caption:{type:'string'}}}};
 n.a.childIds=['at','photo','caption','footer'];
 n.photo={id:'photo',type:'image',props:{width:{value:80,unit:'pt'},height:{value:70,unit:'pt'},source:{scope:'item',key:'photo'}}};
 n.caption={id:'caption',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'caption-leaf',type:'field-ref',scope:'item',key:'caption'}]};
 n.footer={id:'footer',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'footer-leaf',type:'text',text:'FOOTER'}]};
 f.cellRepeats=[{id:'repeat-001',cellId:'a',childTemplateIds:['photo','caption'],source:{scope:'local',key:'evidenceList'}}];
 return t;
}
export const cellRepeatRequest=(items:any[]=[])=>({docKey:'merged',data:{},content:[{format:'merged',data:{evidenceList:items}}]});
