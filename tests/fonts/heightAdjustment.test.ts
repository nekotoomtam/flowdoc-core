import {it,expect} from 'vitest';
import * as api from '../../src/index.js';
const methodId='thai-bo-baseline-top-v1';
const metric=(topDesign='400',unitsPerEm=1000)=>({methodId,topDesign,unitsPerEm});
const request=(fontSizePt=16,sourceMetric:any=metric(),targetMetric:any=metric('586'))=>({fontSizePt,sourceMetric,targetMetric});
const calculate=(input:unknown)=>{
 expect((api as any).calculateFontHeightAdjustment).toBeTypeOf('function');
 return (api as any).calculateFontHeightAdjustment(input);
};
it('exports the pure calculation and method from the public root',()=>{
 expect((api as any).FONT_HEIGHT_METHOD).toBe(methodId);
 expect(calculate(request())).toEqual({ok:true,value:{fontSizePt:10.921502,methodId}});
});
it.each([
 [1,metric('1.2345675'),metric('1'),1.234568],
 [1,metric('1.234567499999'),metric('1'),1.234567],
 [1,metric('1.234567500001'),metric('1'),1.234568],
 [1,metric('1.0000005'),metric('1'),1.000001],
 [1,metric('0.0000005'),metric('1'),0.000001],
 [1.2345675e-1,metric('10'),metric('1'),1.234568],
 [1e-7,metric('10'),metric('1'),0.000001],
 [16,metric('400'),metric('562'),11.3879],
 [16,metric('400'),metric('554'),11.552347],
 [16,metric('400'),metric('535'),11.962617],
 [16,metric('800','2000' as any),metric('586'),null],
 [16,metric('800',2000),metric('586'),10.921502],
 [16,metric('4e2'),metric('5.86e2'),10.921502],
 [16,metric('400.125'),metric('586.25'),10.920256],
])('rounds only the final exact rational result: %j', (size,source,target,expected)=>{
 const result=calculate(request(size,source,target));
 if(expected===null)expect(result).toEqual({ok:false,code:'METRIC_INVALID'});
 else expect(result).toEqual({ok:true,value:{fontSizePt:expected,methodId}});
});
it.each([16.123456789,Number.MIN_VALUE,Number.MAX_VALUE,1e-20,0.0000004999999])('preserves every original digit when ratios are equal: %j',size=>{
 expect(calculate(request(size,metric(),metric('800',2000)))).toEqual({ok:true,value:{fontSizePt:size,methodId}});
});
it.each([NaN,Infinity,-Infinity,0,-1,'16',null,undefined])('rejects invalid pt without throwing: %j',size=>{
 expect(calculate({...request(),fontSizePt:size})).toEqual({ok:false,code:'INVALID_FONT_INPUT'});
});
it.each([
 null,undefined,{}, {outcome:'unavailable'},metric('0'),metric('-1'),metric('NaN'),metric('Infinity'),metric('1e999'),
 metric('1e-999'),metric(' 400 '),metric(''),metric('0x190'),metric('4/10'),metric('4'.repeat(401)),
 metric('400',0),metric('400',15),metric('400',16385),metric('400',1000.1),metric('400',NaN),
 {...metric(),topDesign:400},{...metric(),outcome:'unavailable'},
])('returns unavailable for invalid/missing measurement: %j',bad=>{
 expect(calculate({fontSizePt:16,sourceMetric:metric(),targetMetric:bad})).toEqual({ok:false,code:'METRIC_INVALID'});
 expect(calculate({fontSizePt:16,sourceMetric:bad,targetMetric:metric()})).toEqual({ok:false,code:'METRIC_INVALID'});
});
it('does not mix methods, silently default a missing font, or invoke accessors',()=>{
 expect(calculate(request(16,metric(),{...metric(),methodId:'other-v2'}))).toEqual({ok:false,code:'METHOD_UNSUPPORTED'});
 let reads=0;const input={...request(),get fontSizePt(){reads++;return 16;}};
 expect(calculate(input)).toEqual({ok:false,code:'INVALID_FONT_INPUT'});expect(reads).toBe(0);
 const target={...metric(),get topDesign(){reads++;return '400';}};
 expect(calculate(request(16,metric(),target))).toEqual({ok:false,code:'METRIC_INVALID'});expect(reads).toBe(0);
});
it.each([null,undefined,[],{},new Date(),{...request(),lineHeightPt:20}])('rejects invalid outer contracts: %j',bad=>{
 expect(calculate(bad)).toEqual({ok:false,code:'INVALID_FONT_INPUT'});
});
it('reports numeric range instead of clamping, underflowing or throwing',()=>{
 expect(calculate(request(1,metric('0.000000499999'),metric('1')))).toEqual({ok:false,code:'NUMERIC_RANGE'});
 expect(calculate(request(Number.MAX_VALUE,metric('586'),metric('400')))).toEqual({ok:false,code:'NUMERIC_RANGE'});
 expect(calculate(request(Number.MIN_VALUE,metric('400'),metric('586')))).toEqual({ok:false,code:'NUMERIC_RANGE'});
 // A finite final answer must survive even if the intermediate micro-point integer exceeds Number.MAX_VALUE.
 expect(calculate(request(1e308,metric('2'),metric('1')))).toEqual({ok:false,code:'NUMERIC_RANGE'});
 expect(calculate(request(1e308,metric('1'),metric('2')))).toEqual({ok:true,value:{fontSizePt:5e307,methodId}});
});
it('keeps round-trip drift within the agreed rounding bound across font pairs and sizes',()=>{
 const tops=['400','586','546','544','562','554','535'];
 for(const size of [0.1,10,16,24,123.123456789])for(const a of tops)for(const b of tops){
  const first=calculate(request(size,metric(a),metric(b)));expect(first.ok).toBe(true);
  const back=calculate(request(first.value.fontSizePt,metric(b),metric(a)));expect(back.ok).toBe(true);
  const tolerance=0.0000005*(1+Number(b)/Number(a))+1e-12*Math.max(1,size);
  expect(Math.abs(back.value.fontSizePt-size)).toBeLessThanOrEqual(tolerance);
 }
});
it('does not mutate caller data, line height, selection or font resources',()=>{
 const input=Object.freeze({fontSizePt:16,sourceMetric:Object.freeze(metric()),targetMetric:Object.freeze(metric('586'))});
 const before=JSON.stringify(input);expect(calculate(input).ok).toBe(true);expect(JSON.stringify(input)).toBe(before);
});
