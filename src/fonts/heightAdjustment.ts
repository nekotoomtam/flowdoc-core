/** Fixed measurement convention; changing it requires a new method/profile. */
export const FONT_HEIGHT_METHOD='thai-bo-baseline-top-v1' as const;
export interface FontHeightAdjustmentMetric {
 readonly methodId:typeof FONT_HEIGHT_METHOD;
 readonly unitsPerEm:number;
 readonly topDesign:string;
}
export interface FontHeightAdjustmentInput {
 readonly fontSizePt:number;
 readonly sourceMetric:FontHeightAdjustmentMetric;
 readonly targetMetric:FontHeightAdjustmentMetric;
}
export type FontHeightAdjustmentErrorCode='INVALID_FONT_INPUT'|'METRIC_INVALID'|'METHOD_UNSUPPORTED'|'NUMERIC_RANGE';
export type FontHeightAdjustmentResult=
 | {ok:true;value:{fontSizePt:number;methodId:typeof FONT_HEIGHT_METHOD}}
 | {ok:false;code:FontHeightAdjustmentErrorCode};
interface Fraction {n:bigint;d:bigint}
const MICRO=1000000n;
const fail=(code:FontHeightAdjustmentErrorCode):FontHeightAdjustmentResult=>({ok:false,code});
/** Parsed JSON callers must not cause accessors/class instances to execute. */
function record(value:unknown,fields:readonly string[]):Record<string,unknown>|null {
 try{
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return null;
  const keys=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);
  if(keys.length!==fields.length||keys.some(k=>typeof k!=='string'||!fields.includes(k)))return null;
  if(fields.some(k=>!descriptors[k]?.enumerable||!Object.hasOwn(descriptors[k]!,'value')))return null;
  return value as Record<string,unknown>;
 }catch{return null;}
}
/** Bounded positive decimals, including finite-number exponent notation. */
function decimal(value:string):Fraction|null {
 if(value.length>400)return null;
 const match=/^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(value);
 if(!match||!Number.isFinite(Number(value))||Number(value)<=0)return null;
 const exponent=Number(match[3]??0);
 if(!Number.isInteger(exponent)||Math.abs(exponent)>400)return null;
 const fraction=match[2]??'',coefficient=BigInt(match[1]!+fraction),scale=fraction.length-exponent;
 return scale>=0?{n:coefficient,d:10n**BigInt(scale)}:{n:coefficient*10n**BigInt(-scale),d:1n};
}
function metric(value:unknown):{record:Record<string,unknown>;top:Fraction}|null {
 const r=record(value,['methodId','unitsPerEm','topDesign']);
 if(!r||typeof r.methodId!=='string'||typeof r.topDesign!=='string'||typeof r.unitsPerEm!=='number'||!Number.isInteger(r.unitsPerEm)||r.unitsPerEm<16||r.unitsPerEm>16384)return null;
 const top=decimal(r.topDesign);return top?{record:r,top}:null;
}
/** Pure opt-in calculation. No font lookup, template mutation, layout or I/O. */
export function calculateFontHeightAdjustment(input:FontHeightAdjustmentInput):FontHeightAdjustmentResult {
 const r=record(input,['fontSizePt','sourceMetric','targetMetric']);
 if(!r||typeof r.fontSizePt!=='number'||!Number.isFinite(r.fontSizePt)||r.fontSizePt<=0)return fail('INVALID_FONT_INPUT');
 const source=metric(r.sourceMetric),target=metric(r.targetMetric);
 if(!source||!target)return fail('METRIC_INVALID');
 if(source.record.methodId!==FONT_HEIGHT_METHOD||target.record.methodId!==FONT_HEIGHT_METHOD)return fail('METHOD_UNSUPPORTED');
 const numerator=source.top.n*target.top.d*BigInt(target.record.unitsPerEm as number);
 const denominator=source.top.d*target.top.n*BigInt(source.record.unitsPerEm as number);
 const success=(fontSizePt:number):FontHeightAdjustmentResult=>({ok:true,value:{fontSizePt,methodId:FONT_HEIGHT_METHOD}});
 if(numerator===denominator)return success(r.fontSizePt);
 const size=decimal(r.fontSizePt.toString())!;
 const n=size.n*numerator*MICRO,d=size.d*denominator;
 // Positive round-half-up at the final micro-point boundary only.
 const q=n/d+(2n*(n%d)>=d?1n:0n);
 if(q===0n)return fail('NUMERIC_RANGE');
 const digits=q.toString().padStart(7,'0');
 // Converting q to Number before dividing would overflow for finite large answers.
 const result=Number(digits.slice(0,-6)+'.'+digits.slice(-6));
 if(!Number.isFinite(result)||result<=0)return fail('NUMERIC_RANGE');
 const converted=decimal(result.toString())!;
 const difference=converted.n*MICRO-q*converted.d;
 const absolute=difference<0n?-difference:difference;
 const maximum=converted.n>converted.d?converted.n:converted.d;
 if(absolute*1000000000000n>maximum*MICRO)return fail('NUMERIC_RANGE');
 return success(result);
}
