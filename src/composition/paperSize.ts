import type {ResolvedDocument} from './resolvedDocument.js';
type Page=ResolvedDocument['book']['page'];
const dimensions={A4:[210*72/25.4,297*72/25.4],Letter:[612,792]} as const;

export const isPaperSize=(value:unknown):value is Page['size']=>typeof value==='string'&&Object.hasOwn(dimensions,value);

export function paperSizePt({size,orientation}:Pick<Page,'size'|'orientation'>):readonly [number,number]{
 const [short,long]=dimensions[size];
 return orientation==='landscape'?[long,short]:[short,long];
}
