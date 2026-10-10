import {sectionTemplate} from './sections.js';
export function coverTemplate():any {const t=sectionTemplate();t.nodeModelVersion=13;t.sections[0].role='cover';Object.assign(t.sections[0].source.fragment.nodes.title.props,{heightMode:'fixed',height:{value:30,unit:'mm'}});return t;}
