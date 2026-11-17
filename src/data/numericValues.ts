import type { ObjectSchema } from '../template/types.js';
import type { AreaIndex } from '../template/areas.js';
import { keys, name, object, own } from '../template/checks.js';

export const validNumber = (value: unknown): value is number =>
 typeof value === 'number' && Number.isFinite(value) && Number.isSafeInteger(Math.trunc(value));

export function formulaSource(value: unknown, schema: ObjectSchema, index: AreaIndex) {
 if (!object(value) || !keys(value, ['operation', 'source']) || value.operation !== 'sum') return;
 const source = value.source;
 if (!object(source) || !keys(source, ['areaId', 'formatKey', 'arrayField', 'valueField'])) return;
 const { areaId, formatKey, arrayField, valueField } = source;
 if (!name(areaId) || !name(formatKey) || !name(arrayField) || !name(valueField)) return;
 const area = index.byId.get(areaId);
 if (!area || area.scope !== 'section' || schema.fields[area.key] !== area.field) return;
 const fields = area.formatsByKey.get(formatKey)?.format.inputSchema?.fields;
 const array = fields && own(fields, arrayField) ? fields[arrayField] : undefined;
 if (array?.type !== 'array' || !object(array.items?.fields) || !own(array.items.fields, valueField)) return;
 const field = array.items.fields[valueField];
 if (field?.type !== 'number' || field.formula) return;
 return { area, formatKey, arrayField, valueField, field };
}

export function numberParts(value: number) {
 const [mantissa, exponent = '0'] = Math.abs(value).toString().split('e');
 const [integer = '', fraction = ''] = mantissa!.split('.');
 const digits = integer + fraction, point = integer.length + Number(exponent);
 const whole = point <= 0 ? '0' : digits.slice(0, point).padEnd(point, '0');
 const decimal = (point <= 0 ? '0'.repeat(-point) + digits : digits.slice(point)).replace(/0+$/, '');
 return { whole, decimal };
}

// Sum the decimal representations before the one conversion back to Number.
export class NumericSum {
 private total = 0n;
 private scale = 0;
 add(value: number) {
  const { whole, decimal } = numberParts(value);
  const scale = Math.max(this.scale, decimal.length);
  this.total *= 10n ** BigInt(scale - this.scale);
  const units = BigInt(whole + decimal.padEnd(scale, '0'));
  this.total += value < 0 ? -units : units;
  this.scale = scale;
 }
 value() { return Number(this.total.toString() + 'e-' + this.scale); }
}
