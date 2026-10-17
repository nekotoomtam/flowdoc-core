import {sectionTemplate} from './sections.js';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
export const sectionId='10000000-0000-4000-8000-000000000001';
export function areaCover(text='Cover',height=120):any {
 const t=sectionTemplate();t.nodeModelVersion=19;t.globalSchema={type:'object',fields:{}};t.areaFormats={};
 const s=t.sections[0];delete s.key;delete s.formats;s.id=sectionId;s.label='Document1';s.nameBase='Document';
 s.inputSchema={type:'object',fields:{parts:{type:'area',areaId:'parts'}}};
 s.source={kind:'authored',repeats:[],fragment:{rootIds:['parts'],nodes:{parts:{id:'parts',type:'area',props:{areaId:'parts'}}}}};t.sections=[s];
 t.areaFormats.panel={key:'panel',ownerAreaId:'parts',inputSchema:{type:'object',fields:{}},repeats:[],fragment:{rootIds:['title','after'],nodes:{title:{id:'title',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',heightMode:'fixed',height:{value:height,unit:'pt'},verticalAlign:'center'},children:text?[{id:'leaf',type:'text',text}]:[]},after:{id:'after',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'after-leaf',type:'text',text:'AFTER'}]}}}};
 return t;
}
export function areaRequest(t:any,parts=[{format:'panel',data:{}}]):any{return {docKey:t.docKey,data:{},sections:[{id:sectionId,data:{parts}}]};}
export function composeArea(t=areaCover(),parts?:any[]){
 const v=validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));
 const p=prepareGeneration(v.value,areaRequest(t,parts));if(!p.ok)throw Error(JSON.stringify(p));
 const d=composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
