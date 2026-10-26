import {sectionTemplate} from './sections.js';
export const assemblyId=(n:number)=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function assemblyTemplate():any {
 const t=sectionTemplate();t.nodeModelVersion=20;t.areaFormats={};t.globalSchema={type:'object',fields:{}};
 t.sections=t.sections.map((s:any,i:number)=>{
  delete s.key;delete s.formats;
  return {...s,id:assemblyId(i+1),sectionKey:i?'B':'A',label:'Same label',nameBase:'Example',inputSchema:{type:'object',fields:{name:{type:'string',required:true}}},source:{kind:'authored',repeats:[],fragment:{rootIds:['text'],nodes:{text:{id:'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:'local'},children:[{id:'value',type:'field-ref',scope:'section',key:'name'},{id:'ref',type:'reference',text:'Local',target:'local'}]}}}}};
 });return t;
}
export const assemblyRequest=(t:any)=>({docKey:t.docKey,version:t.version,data:{},sections:[{sectionKey:'A',instanceKey:'first',data:{name:'Alpha'}},{sectionKey:'B',instanceKey:'middle',data:{name:'Beta'}},{sectionKey:'A',instanceKey:'last',data:{name:'Gamma'}}]});
