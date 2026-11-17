import type {ComputedText, ObjectSchema} from '../template/types.js';
import {keys, object, own} from '../template/checks.js';

export function isComputedText(value: unknown, schema: ObjectSchema): value is ComputedText {
 if(!object(value)||!keys(value,['calculation','inputs'])||value.calculation!=='packageQuantityInWords'
   ||!object(value.inputs)||!keys(value.inputs,['quantity','unit']))return false;
 const {quantity,unit}=value.inputs;
 if(quantity===unit)return false;
 return [quantity,unit].every(key=>typeof key==='string'&&own(schema.fields,key)
   &&schema.fields[key]?.type==='string'&&!schema.fields[key].computed);
}

const small=['ZERO','ONE','TWO','THREE','FOUR','FIVE','SIX','SEVEN','EIGHT','NINE','TEN','ELEVEN','TWELVE','THIRTEEN','FOURTEEN','FIFTEEN','SIXTEEN','SEVENTEEN','EIGHTEEN','NINETEEN'];
const tens=['','','TWENTY','THIRTY','FORTY','FIFTY','SIXTY','SEVENTY','EIGHTY','NINETY'];
const scales=['','THOUSAND','MILLION','BILLION','TRILLION'];

function groupWords(group:number):string {
 const parts:string[]=[];
 if(group>=100)parts.push(small[Math.floor(group/100)]!,'HUNDRED');
 const rest=group%100;
 if(rest>=20)parts.push(tens[Math.floor(rest/10)]!);
 if(rest&&rest<20)parts.push(small[rest]!);
 else if(rest%10)parts.push(small[rest%10]!);
 return parts.join(' ');
}

/** Empty input has no result. Undefined means the quantity is invalid. */
export function calculateComputedText(quantity:unknown,unit:unknown):string|undefined {
 if(typeof quantity!=='string'||typeof unit!=='string')return undefined;
 const digits=quantity.trim().replaceAll(',','').replace(/^0+(?=\d)/,'');
 if(!digits)return quantity.trim()===''?'':undefined;
 if(!/^\d{1,15}$/.test(digits))return undefined;
 const parts:string[]=[];
 for(let end=digits.length,scale=0;end>0;end-=3,scale++){
  const group=Number(digits.slice(Math.max(0,end-3),end));
  if(group)parts.unshift([groupWords(group),scales[scale]].filter(Boolean).join(' '));
 }
 const label=unit.trim().replace(/\s+/g,' ').toUpperCase();
 return 'SAY 1 : '+(parts.join(' ')||small[0])+(label?' '+label:'')+' ONLY.';
}
