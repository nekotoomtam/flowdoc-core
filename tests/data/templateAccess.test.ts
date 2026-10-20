import {it,expect} from 'vitest';
import {TemplateAccess} from '../../src/template/taskAccess.js';
import {areaCover} from '../helpers/areaCover.js';
import {validateTemplate} from '../../src/index.js';
it('prepares schema, repeat and binding access once within a pinned operation',()=>{
 const v=validateTemplate(areaCover());if(!v.ok)throw Error();const a=new TemplateAccess(v.value),schema=v.value.definition.globalSchema;
 expect(a.schema(schema)).toBe(a.schema(schema));const f=Object.values(v.value.definition.areaFormats)[0]!;
 expect(a.format(f)).toBe(a.format(f));const n:any={type:'text-block',props:{anchorId:{scope:'local',key:'x'}},children:[{type:'field-ref',scope:'item',key:'name'},{type:'link',text:{scope:'item',key:'name'},target:{scope:'local',key:'url'}}]};
 expect(a.refs(n)).toBe(a.refs(n));expect(a.refs(n)).toHaveLength(4);
 expect(a.stats.hits).toBeGreaterThan(0);a.clear();expect(a.stats.entries).toBe(0);expect(a.stats.bytes).toBe(0);
});
it('bounds retained access metadata and uses the same uncached plan after exhaustion or disable',()=>{
 const v=validateTemplate(areaCover());if(!v.ok)throw Error();const a=new TemplateAccess(v.value,true,128),schema={type:'object',fields:{long:{type:'string'}}} as any;
 const expected=new TemplateAccess(v.value,false).schema(schema);for(let i=0;i<2000;i++)expect(a.schema(structuredClone(schema))).toEqual(expected);
 expect(a.stats.bytes).toBeLessThanOrEqual(128);expect(a.stats.fallbacks).toBeGreaterThan(0);const off=new TemplateAccess(v.value,false);expect(off.schema(schema)).not.toBe(off.schema(schema));expect(off.stats.bytes).toBe(0);
});
it('never shares access plans across fingerprints, models, cloned or changed binding definitions',()=>{
 const v=validateTemplate(areaCover());if(!v.ok)throw Error();const a=new TemplateAccess(v.value),other=new TemplateAccess({...v.value,fingerprint:'different'});
 expect(a.schema(v.value.definition.globalSchema)).not.toBe(other.schema(v.value.definition.globalSchema));
 const n:any={type:'image',props:{source:{scope:'local',key:'one'}}};expect(a.refs(n)[0].key).toBe('one');const clone=structuredClone(n);clone.props.source.key='two';expect(other.refs(clone)[0].key).toBe('two');
});
