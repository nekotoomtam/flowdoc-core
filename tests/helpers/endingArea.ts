import {sizingTemplate,composeSizing,sizingEntry,setSizingBodyHeight} from './formatSizing.js';
export function endingTemplate(prefix='BODY',height=100):any {
 const t=sizingTemplate({mode:'auto'}),f=t.sections[0].source.fragment;
 f.nodes.parts.props.verticalAlign='bottom';
 f.nodes.prefix={id:'prefix',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'prefix-leaf',type:'text',text:prefix}]};
 f.rootIds.unshift('prefix');setSizingBodyHeight(t,height);return t;
}
export const endingDocument=(prefix='BODY',text='SIGN',height=100)=>composeSizing(endingTemplate(prefix,height),[sizingEntry(text)]);
