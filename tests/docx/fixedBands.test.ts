import {expect,it} from 'vitest';
import * as api from '../../src/index.js';
import {bandTemplate} from '../helpers/bands.js';
import {fonts,noImages,staged} from './helpers.js';
import {imageId,imageProvider} from './imageFixtures.js';
it.each([100,28])('supports a bounded fixed band without clipping, height=%s',async height=>{
 const t=bandTemplate();t.sections=[t.sections[0]];t.areaFormats={};delete t.sections[0].footer;
 t.sections[0].header.sizing={mode:'fixed',height:{unit:'pt',value:height}};
 const v=api.validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));
 const p=api.prepareGeneration(v.value,{docKey:t.docKey,data:{projectName:'BODY'},sections:{intro:{header:{projectName:'HEADER\nSECOND\nTHIRD'}}}});if(!p.ok)throw Error(JSON.stringify(p));
 const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));const before=JSON.stringify(d.value);
 const e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const sink=staged(),r=await e.value.generateDocxTo(d.value,noImages,sink.output);
 expect(r.ok,JSON.stringify(r)).toBe(height===100);
 if(r.ok)expect(r.value.adaptations).toEqual(expect.arrayContaining([expect.objectContaining({kind:'fixed-band-native-reservation',sourceHeightPt:100,wordVerified:false})]));
 else expect(sink.chunks).toEqual([]);
 expect(JSON.stringify(d.value)).toBe(before);
});
it('retains an image at its declared height and accounts for native wrapper overhead',async()=>{
 const t=bandTemplate();t.sections=[t.sections[0]];t.areaFormats={};delete t.sections[0].footer;
 t.globalSchema.fields.photo={type:'image',required:true};const band=t.sections[0].header;
 band.inputSchema={type:'object',fields:{}};
 band.sizing={mode:'fixed',height:{unit:'pt',value:30}};
 band.placement={mode:'page',left:{unit:'pt',value:0},right:{unit:'pt',value:0},offset:{unit:'pt',value:0}};
 band.fragment={rootIds:['logo'],nodes:{logo:{id:'logo',type:'image',props:{width:{unit:'pt',value:100},height:{unit:'pt',value:30},source:{scope:'global',key:'photo'}}}}};
 const v=api.validateTemplate(t);if(!v.ok)throw Error(JSON.stringify(v));const p=api.prepareGeneration(v.value,{docKey:t.docKey,data:{projectName:'BODY',photo:imageId},sections:{}});if(!p.ok)throw Error(JSON.stringify(p));
 const d=api.composeDocument(v.value,p.value);if(!d.ok)throw Error(JSON.stringify(d));const e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const sink=staged();
 const r=await e.value.generateDocxTo(d.value,imageProvider().provider,sink.output);expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
 expect(r.value.adaptations).toEqual(expect.arrayContaining([expect.objectContaining({kind:'fixed-band-native-reservation',sourceHeightPt:30,contentBoundPt:30,structuralOverheadPt:2,nativeReservedHeightPt:32})]));
});
