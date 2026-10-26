import {ImportedXmlComponent} from 'docx';
import type {ResolvedStroke} from '../composition/strokeStyle.js';
type Edge={x0:number;y0:number;x1:number;y1:number};
const e=(tag:string,attributes:Record<string,string|number>={},...children:(ImportedXmlComponent|string)[])=>{
 const node=new ImportedXmlComponent(tag,Object.fromEntries(Object.entries(attributes).map(([k,v])=>[k,String(v)])));
 for(const c of children)node.push(c);return node;
};
/** Construct components directly: fromXmlString parses an XML document wrapper,
 * not a single run child, so importing it verbatim would emit <undefined>. */
export function compoundDrawing(id:number,width:number,height:number,leftTwips:number,topTwips:number,stroke:ResolvedStroke,edges:Edge[]){
 const emu=(v:number)=>Math.round(v*12700),pt=(v:number)=>Math.round(v*1000),extent={cx:emu(width),cy:emu(height)};
 const lines=edges.flatMap(v=>[e('a:moveTo',{},e('a:pt',{x:pt(v.x0),y:pt(v.y0)})),e('a:lnTo',{},e('a:pt',{x:pt(v.x1),y:pt(v.y1)}))]);
 const geometry=e('a:custGeom',{},e('a:avLst'),e('a:gdLst'),e('a:ahLst'),e('a:cxnLst'),e('a:rect',{l:0,t:0,r:'r',b:'b'}),e('a:pathLst',{},e('a:path',{w:pt(width),h:pt(height),fill:'none',stroke:1,extrusionOk:0},...lines)));
 const pen=e('a:ln',{w:emu(stroke.widthPt),cap:'flat',cmpd:'thickThin',algn:'ctr'},e('a:solidFill',{},e('a:srgbClr',{val:stroke.color})),e('a:custDash',{},e('a:ds',{d:400000,sp:1200000})),e('a:miter',{lim:800000}));
 const shape=e('wps:wsp',{'xmlns:wps':'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'},e('wps:cNvSpPr'),e('wps:spPr',{},e('a:xfrm',{},e('a:off',{x:0,y:0}),e('a:ext',extent)),geometry,e('a:noFill'),pen),e('wps:bodyPr'));
 const half=emu(stroke.widthPt/2);
 const anchor=e('wp:anchor',{distT:0,distB:0,distL:0,distR:0,simplePos:0,relativeHeight:0,behindDoc:1,locked:0,layoutInCell:1,allowOverlap:1},
  e('wp:simplePos',{x:0,y:0}),e('wp:positionH',{relativeFrom:'column'},e('wp:posOffset',{},String(-leftTwips*635))),e('wp:positionV',{relativeFrom:'paragraph'},e('wp:posOffset',{},String(-topTwips*635))),
  e('wp:extent',extent),e('wp:effectExtent',{l:half,t:half,r:half,b:half}),e('wp:wrapNone'),e('wp:docPr',{id,name:'FlowDoc B row stroke '+id}),e('wp:cNvGraphicFramePr'),e('a:graphic',{'xmlns:a':'http://schemas.openxmlformats.org/drawingml/2006/main'},e('a:graphicData',{uri:'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'},shape)));
 return e('w:drawing',{},anchor);
}
