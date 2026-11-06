import type { ResolvedDocument } from '../../src/composition/resolvedDocument.js';
export function document(text='abc'):ResolvedDocument {
 const rootIds=['t'];const page:any={size:'A4',orientation:'portrait',margin:{top:{value:20,unit:'mm'},bottom:{value:20,unit:'mm'},left:{value:20,unit:'mm'},right:{value:20,unit:'mm'}}};
 return {schemaVersion:1,nodeModelVersion:20,sections:[{definitionId:'10000000-0000-4000-8000-000000000001',sectionKey:'main',instanceKey:'main',sectionId:'instance-main',sourceKind:'authored',role:'body',headerMode:'all',footerMode:'all',pageLayoutId:'normal',page,rootIds}],template:{templateId:'test',docKey:'test',version:1},book:{contentSlot:'body',page},styles:{body:{fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:12,unit:'pt'},lineHeightPt:18}},rootIds,nodes:{t:{id:'t',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'leaf',type:'text',text}]}},sourceMap:{t:{origin:'authored',sectionId:'instance-main',sourceId:'t'},leaf:{origin:'authored',sectionId:'instance-main',sourceId:'leaf'}}};
}
export const fakeRuntime={
 async breaks(text:string){return [...new Intl.Segmenter('th',{granularity:'word'}).segment(text)].map(s=>s.index+s.segment.length);},
 async shape(text:string){let offset=0;return {ascentPt:10,descentPt:3,glyphs:[...text].map(ch=>{const start=offset;offset+=ch.length;return {glyphId:1,advancePt:5,offsetXPt:0,offsetYPt:0,clusterStartOffset:start,clusterEndOffset:offset};})};}
};
