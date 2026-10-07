import type { ResolvedDocument } from '../../src/composition/resolvedDocument.js';
export function document(text='abc'):ResolvedDocument {
 return {schemaVersion:1,nodeModelVersion:4,template:{templateId:'test',docKey:'test',version:1},book:{contentSlot:'body',page:{size:'A4',orientation:'portrait',margin:{top:{value:20,unit:'mm'},bottom:{value:20,unit:'mm'},left:{value:20,unit:'mm'},right:{value:20,unit:'mm'}}}},styles:{body:{fontFamilyKey:'sarabun',fontWeight:'normal',fontSize:{value:12,unit:'pt'},lineHeightPt:18}},rootIds:['t'],nodes:{t:{id:'t',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'leaf',type:'text',text}]}},sourceMap:{t:{contentIndex:0,format:'note',sourceId:'t'}}};
}
export const fakeRuntime={
 async breaks(text:string){return [...new Intl.Segmenter('th',{granularity:'word'}).segment(text)].map(s=>s.index+s.segment.length);},
 async shape(text:string){let offset=0;return {ascentPt:10,descentPt:3,glyphs:[...text].map(ch=>{const start=offset;offset+=ch.length;return {glyphId:1,advancePt:5,offsetXPt:0,offsetYPt:0,clusterStartOffset:start,clusterEndOffset:offset};})};}
};
