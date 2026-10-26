import type {LineBlock} from '../composition/resolvedDocument.js';
import {toPt} from '../composition/resolvedDocument.js';
import {LayoutError} from './textFlow.js';
import {resolveLineStroke,strokeEnvelope} from '../composition/strokeStyle.js';
export function measureRule(n:LineBlock,available:number){
 const width=n.props.width?toPt(n.props.width):available,thickness=n.props.thickness?toPt(n.props.thickness):.5,before=n.props.spaceBefore?toPt(n.props.spaceBefore):0,after=n.props.spaceAfter?toPt(n.props.spaceAfter):0;
 if(![width,thickness,before,after].every(Number.isFinite)||width<=0||thickness<=0||before<0||after<0||width>available+1e-6)throw new LayoutError(n.id,'Invalid horizontal line geometry');
 const stroke=resolveLineStroke(n),envelope=strokeEnvelope(stroke);
 return {offset:n.props.align==='right'?available-width:n.props.align==='center'?(available-width)/2:0,width,thickness:envelope,before,height:before+envelope+after,color:stroke.color,stroke};
}
