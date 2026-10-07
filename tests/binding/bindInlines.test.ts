import {it,expect} from 'vitest';
import {bindInlines} from '../../src/binding/bindInlines.js';
it('binds plain strings literally with newline parts, not interpolation',()=>{
 const source:any={};const r=bindInlines([{id:'x',type:'field-ref',scope:'local',key:'value'}],{global:{},local:{value:'${not_code}\r\n X'},item:{}},'content-0~',undefined,{contentIndex:0,format:'a'},source);
 expect(r.map(c=>c.type==='text'?c.text:'\n')).toEqual(['${not_code}','\n',' X']);expect(r.map(c=>c.id)).toEqual(['content-0~x~part-0','content-0~x~part-1','content-0~x~part-2']);expect(Object.keys(source)).toHaveLength(3);
});
