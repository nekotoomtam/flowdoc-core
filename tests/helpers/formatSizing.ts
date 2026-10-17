import {areaCover,areaRequest} from './areaCover.js';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
export function sizingTemplate(sizing?:unknown):any {
 const t=areaCover();delete t.sections[0].header;delete t.sections[0].footer;t.styles.body.lineHeightPt=20;
 t.areaFormats.panel={key:'panel',ownerAreaId:'parts',...(sizing===undefined?{}:{sizing}),inputSchema:{type:'object',fields:{text:{type:'string',required:true}}},repeats:[],fragment:{rootIds:['text'],nodes:{text:{id:'text',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'value',type:'field-ref',scope:'local',key:'text'}]}}}};
 return t;
}
export const sizingEntry=(text:string)=>({format:'panel',data:{text}});
export function composeSizing(t:any,entries:any[]=[sizingEntry('A')]):any {
 const v=validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));
 const p=prepareGeneration(v.value,areaRequest(t,entries));if(!p.ok)throw Error(JSON.stringify(p));
 const d=composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
