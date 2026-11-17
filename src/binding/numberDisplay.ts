import { numberParts } from '../data/numericValues.js';
import { englishInteger } from '../data/computedValues.js';
import type { NumberDisplay } from '../template/types.js';

const th = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const places = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function thaiInteger(digits: string): string {
 if (digits === '0') return th[0]!;
 let out = '';
 for (let i = 0; i < digits.length; i++) {
  const digit = Number(digits[i]), power = digits.length - 1 - i, place = power % 6;
  if (digit) {
   if (place === 1) out += digit === 1 ? 'สิบ' : digit === 2 ? 'ยี่สิบ' : th[digit] + 'สิบ';
   else if (place === 0 && digit === 1 && i > 0) out += 'เอ็ด';
   else out += th[digit] + places[place]!;
  }
  if (power && place === 0) out += 'ล้าน';
 }
 return out;
}

export function displayNumber(value: number, mode?: NumberDisplay): string {
 if (!mode || mode === 'digits') return String(value);
 const { whole, decimal } = numberParts(value);
 if (mode === 'words-th')
  return (value < 0 ? 'ลบ' : '') + thaiInteger(whole) + (decimal ? 'จุด' + [...decimal].map(d => th[Number(d)]).join('') : '');
 return (value < 0 ? 'MINUS ' : '') + englishInteger(whole) + (decimal ? ' POINT ' + [...decimal].map(englishInteger).join(' ') : '');
}
