/** Portable download base name, never a path or an output-format selection.
 * Empty strings mean no configured/requested override. Undefined means invalid. */
export function normalizeOutputName(value:unknown):string|undefined {
 if(typeof value!=='string'||!value.isWellFormed()||/[\p{Cc}\p{Cf}]/u.test(value))return;
 const name=value.trim().normalize('NFC');
 if(!name)return '';
 if([...name].length>200||Buffer.byteLength(name,'utf8')>240||/[\\/:*?"<>|]/u.test(name)||name.endsWith('.')||/\.(pdf|docx)$/i.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))return;
 return name;
}
