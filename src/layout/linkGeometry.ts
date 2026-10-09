import type {ResolvedDocument} from '../composition/resolvedDocument.js';
import type {DrawDocument,LinkAnnotation} from '../pdf/drawContract.js';
import {LayoutError} from './textFlow.js';
// Layout has already fixed line/page positions. Never reshape slices here.
export function resolveLinkGeometry(document:ResolvedDocument,draw:DrawDocument):void {
 if(document.nodeModelVersion!==7)return;
 const targets=new Map(Object.values(document.nodes).filter(n=>n.type==='text-block'&&n.props.anchorId!==undefined).map(n=>[n.id,(n as import('../composition/resolvedDocument.js').TextBlock).props.anchorId!]));
 const anchors:NonNullable<DrawDocument['anchors']>=Object.create(null);
 for(const [pageIndex,page] of draw.pages.entries())for(const run of page.commands){
  const anchor=targets.get(run.nodeId);
  if(anchor!==undefined&&!Object.hasOwn(anchors,anchor)&&run.text.trim())anchors[anchor]={pageIndex,xPt:run.bounds.xPt,yPt:run.bounds.yPt};
  if(!run.links?.length)continue;
  let cursor=run.bounds.xPt;
  const areas=new Map<string,LinkAnnotation>();
  for(const [glyphIndex,glyph] of run.glyphs.entries()){
   const start=(run.sourceStart??0)+glyph.clusterStartOffset,end=(run.sourceStart??0)+glyph.clusterEndOffset;
   const owners=run.links.filter(s=>s.start<end&&s.end>start);
   if(owners.length>1)throw new LayoutError(run.nodeId,'Ambiguous link ownership of a shaped cluster');
   const owner=owners[0];
   if(owner){
    const ink=run.glyphInkBoundsPt?.[glyphIndex];
    const left=Math.min(cursor,cursor+(ink?.left??glyph.offsetXPt)),right=Math.max(cursor+glyph.advancePt,cursor+(ink?.right??(glyph.offsetXPt+glyph.advancePt)));
    const previous=areas.get(owner.id);
    if(previous){const x=Math.min(previous.rect.xPt,left);previous.rect.widthPt=Math.max(previous.rect.xPt+previous.rect.widthPt,right)-x;previous.rect.xPt=x;}
    else areas.set(owner.id,{nodeId:run.nodeId,linkId:owner.id,rect:{xPt:left,yPt:run.bounds.yPt,widthPt:right-left,heightPt:run.bounds.heightPt},destination:owner.link.type==='reference'?{type:'internal',target:owner.link.target}:{type:'external',url:owner.link.type==='url'?owner.link.value:owner.link.url}});
   }
   cursor+=glyph.advancePt;
  }
  const nonempty=[...areas.values()].filter(a=>a.rect.widthPt>0);
  if(nonempty.length)(page.annotations??=[]).push(...nonempty);
 }
 for(const [id,anchor] of targets)if(!Object.hasOwn(anchors,anchor))throw new LayoutError(id,'Destination has no nonempty positioned line');
 if(targets.size)draw.anchors=anchors;
 for(const page of draw.pages)for(const a of page.annotations??[])if(a.destination.type==='internal'&&!Object.hasOwn(anchors,a.destination.target))throw new LayoutError(a.nodeId,'Missing positioned destination');
}
