import {object,keys} from './checks.js';
export type FormatSizing={mode:'auto'}|{mode:'fixed';height:import('../composition/resolvedDocument.js').Length};
export function isFormatSizing(value:unknown):value is FormatSizing {
 if(!object(value))return false;
 if(value.mode==='auto')return keys(value,['mode']);
 const h=value.height;
 return value.mode==='fixed'&&keys(value,['mode','height'])&&object(h)&&keys(h,['value','unit'])&&['pt','mm'].includes(h.unit)&&typeof h.value==='number'&&Number.isFinite(h.value)&&h.value>0&&Number.isFinite(h.value*(h.unit==='mm'?72/25.4:1));
}
