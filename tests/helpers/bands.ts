import {sectionTemplate} from './sections.js';
export function bandTemplate():any {const t=sectionTemplate();t.nodeModelVersion=14;for(const k of ['header','footer'])t[k]={baseTextStyleId:'body',inputSchema:{type:'object',fields:{projectName:{type:'string',required:true}}},fragment:structuredClone(t.sections[0].source.fragment)};return t;}
