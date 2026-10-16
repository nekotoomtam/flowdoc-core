import {sectionTemplate} from './sections.js';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
export const sid=(i:number)=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`;
export function scopedTemplate(count=3,whole=false):any {
 const t=sectionTemplate();Object.assign(t,{nodeModelVersion:19,areaFormats:{},globalSchema:{type:'object',fields:{}}});
 t.styles.body.lineHeightPt=22;
 t.sections.forEach((s:any,i:number)=>{
  delete s.key;delete s.formats;s.id=sid(i+1);s.label='Document'+(i+1);s.nameBase='Document';delete s.pageLayoutId;
  s.inputSchema={type:'object',fields:{label:{type:'string',required:true}}};
  s.numbering=i?{mode:'restart',startAt:7}:{mode:'continue'};
  const f={rootIds:['toc','break'] as string[],nodes:{toc:{id:'toc',type:'table-of-contents',props:{textStyleId:'body',scope:{kind:'section'}}},break:{id:'break',type:'page-break'}} as any};
  if(whole&&i===0){f.rootIds.unshift('whole','whole-break');f.nodes.whole={id:'whole',type:'table-of-contents',props:{textStyleId:'body',scope:{kind:'document'}}};f.nodes['whole-break']={id:'whole-break',type:'page-break'};}
  for(let h=0;h<count;h++){const id='h'+h;f.rootIds.push(id);f.nodes[id]={id,type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body',anchorId:id,toc:{level:h%3+1}},children:[{id:id+'-label',type:'field-ref',scope:'section',key:'label'},{id:id+'-text',type:'text',text:` H${String(h).padStart(3,'0')} หัวข้อทดสอบ`}]};}
  s.source={kind:'authored',repeats:[],fragment:f};
 });return t;
}
export function scopedRequest(t:any):any{return {docKey:t.docKey,data:{},sections:t.sections.map((s:any,i:number)=>({id:s.id,data:{label:i?'Beta':'Alpha'}}))};}
export function composeScoped(t=scopedTemplate(),r=scopedRequest(t)){
 const v=validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));const p=prepareGeneration(v.value,r);if(!p.ok)throw Error(JSON.stringify(p));const d=composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));return d.value;
}
