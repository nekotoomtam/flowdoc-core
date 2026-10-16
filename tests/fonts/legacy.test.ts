import {it,expect} from 'vitest';
import * as api from '../../src/fonts/selection.js';
import {document,fakeRuntime} from '../helpers/document.js';
import {measureText} from '../../src/layout/measureText.js';
it.each([['normal','normal','font-regular'],['bold','normal','font-bold'],['normal','italic','font-italic'],['bold','italic','font-bold-italic']])('retains %s/%s exact legacy ID and geometry',async(weight,italic,id)=>{
 expect(api.fontIdForStyle).toBeTypeOf('function');
 const d=document('Sarabun ภาษาไทย'),s:any={...d.styles.body,fontWeight:weight,fontStyle:italic};
 expect(api.fontIdForStyle(s)).toBe(id);const before=JSON.stringify(s);
 const a=await measureText(d.nodes.t as any,s,100,fakeRuntime),b=await measureText(d.nodes.t as any,s,100,{...fakeRuntime,fontId:()=>id});
 expect(a).toEqual(b);expect(JSON.stringify(s)).toBe(before);
});
