// Fixture authoring only: construct explicit model20 occurrences. No legacy
// template/request decoding or runtime normalization belongs in this helper.
export const sectionUse=(definition:{sectionKey:string},instanceKey=definition.sectionKey,data:Record<string,unknown>={},bands:Record<string,unknown>={})=>({sectionKey:definition.sectionKey,instanceKey,data,...bands});
export const defaultUses=(template:{sections:{sectionKey:string}[]})=>template.sections.map(s=>sectionUse(s));
