import {it,expect} from 'vitest';
import {bindInlines} from '../../src/binding/bindInlines.js';
it('binds plain strings literally with newline parts, not interpolation',()=>{
 const source:any={};const r=bindInlines([{id:'x',type:'field-ref',scope:'local',key:'value'}],{global:{},local:{value:'${not_code}\r\n X'},item:{}},'section-instance-main~',undefined,{origin:'authored',sectionId:'instance-main'},source);
 expect(r.map(c=>c.type==='text'?c.text:'\n')).toEqual(['${not_code}','\n',' X']);expect(r.map(c=>c.id)).toEqual(['section-instance-main~x~part-0','section-instance-main~x~part-1','section-instance-main~x~part-2']);expect(Object.keys(source)).toHaveLength(3);
});
