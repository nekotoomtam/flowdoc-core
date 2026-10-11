import type {LineBlock} from '../composition/resolvedDocument.js';
import {toPt} from '../composition/resolvedDocument.js';
import {LayoutError} from './textFlow.js';
export function measureRule(n:LineBlock,available:number){
 const width=n.props.width?toPt(n.props.width):available,thickness=n.props.thickness?toPt(n.props.thickness):.5,before=n.props.spaceBefore?toPt(n.props.spaceBefore):0,after=n.props.spaceAfter?toPt(n.props.spaceAfter):0;
 if(![width,thickness,before,after].every(Number.isFinite)||width<=0||thickness<=0||before<0||after<0||width>available+1e-6)throw new LayoutError(n.id,'Invalid horizontal line geometry');
 return {width,thickness,before,height:before+thickness+after,color:n.props.color??'000000'};
}
