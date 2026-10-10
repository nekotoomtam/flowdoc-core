import {measurePageBand,selectPageBands,type MeasuredBand} from './pageBands.js';
import type {BandMode} from '../template/types.js';
import {assignCountedPages} from './pageCounting.js';
import {measureFixedTextBlock} from './fixedTextBlock.js';
import {cellTableFlow} from './cellTableFlow.js';
import {collectContents} from '../composition/contents.js';
import {measureContents} from './measureContents.js';
import {mergedTableFlow} from './mergedTableFlow.js';
import {toPt} from '../composition/resolvedDocument.js';
import type {ResolvedDocument,Table,TableRow} from '../composition/resolvedDocument.js';
import type {DrawDocument,DrawPage} from '../pdf/drawContract.js';
import {textFlow,LayoutError} from './textFlow.js';
import type {TextRuntime} from './textFlow.js';
import {measureText} from './measureText.js';
import type {MeasuredLine} from './measureText.js';
import type {PdfImageResources} from '../pdf/imageResources.js';
interface Cell {id:string;lines:MeasuredLine[]}
interface Row {id:string;allowBreak:boolean;cells:Cell[];height:number}
const pad=4,epsilon=1e-6;
export async function documentFlow(d:ResolvedDocument,runtime:TextRuntime,images:PdfImageResources={}):Promise<DrawDocument>{
 // Preserve the established text-only drawing contract and exact PDF identity.
 if((d.nodeModelVersion!==12&&d.nodeModelVersion!==13&&d.nodeModelVersion!==14&&d.nodeModelVersion!==15)&&d.rootIds.every(id=>d.nodes[id]?.type==='text-block'))return textFlow(d,runtime);
 let widthPt=0,heightPt=0,left=0,top=0,bottom=0,available=0,innerTop=0,innerBottom=0;
 let modes:{headerMode?:BandMode;footerMode?:BandMode}={},bands:Partial<Record<'header'|'footer',MeasuredBand>>={};
 let activeBands:Pick<ResolvedDocument,'header'|'footer'>=d;
 const bandCache=new Map<string,MeasuredBand>();
 const setPage=(page:ResolvedDocument['book']['page'])=>{
  const [w,h]=page.orientation==='portrait'?[210,297]:[297,210];
  widthPt=w!*72/25.4;heightPt=h!*72/25.4;left=toPt(page.margin.left);top=toPt(page.margin.top);bottom=heightPt-toPt(page.margin.bottom);available=widthPt-left-toPt(page.margin.right);
 };
 setPage(d.book.page);innerTop=top;innerBottom=bottom;
 let sectionId:string|undefined,sectionPageIndex=0,cover=false,activeNode='';let pageRole:'body'|'cover'|'blank'='body';
 const contentsSlots:NonNullable<DrawDocument['contentsSlots']>=[];
 const entries=d.rootIds.some(id=>d.nodes[id]?.type==='table-of-contents')?collectContents(d):[];
 const pages:DrawPage[]=[];let current!:DrawPage,y=top,serial=0;
 const geometry=(index:number)=>{const shown=selectPageBands(modes,pageRole,index),h=shown.header?bands.header:undefined,f=shown.footer?bands.footer:undefined,hspace=h?h.heightPt+(activeBands.header?.gap?toPt(activeBands.header.gap):0):0,fspace=f?f.heightPt+(activeBands.footer?.gap?toPt(activeBands.footer.gap):0):0;
  if(hspace+fspace>(innerBottom-innerTop)*.4+epsilon)throw new LayoutError((h?activeBands.header:activeBands.footer)?.rootIds[0]??activeNode,'Page bands exceed 40 percent of inner page height',sectionId,(h?'header':'footer')+'.sizing');return {top:innerTop+hspace,bottom:innerBottom-fspace,h,f};};
 const nextPage=()=>{if(cover&&sectionPageIndex>0)throw new LayoutError(activeNode,'Cover exceeds one page');const g=geometry(sectionPageIndex);top=g.top;bottom=g.bottom;
  current={...(d.nodeModelVersion>=13?{pageRole}:{}),widthPt,heightPt,backgroundColor:'FFFFFF',commands:[],...(sectionId===undefined?{}:{sectionId,sectionPageIndex:sectionPageIndex++})};pages.push(current);y=top;
  for(const [kind,m,at] of [['header',g.h,innerTop],['footer',g.f,innerBottom-(g.f?.heightPt??0)]] as const){if(!m)continue;for(const run of m.commands)current.commands.push({...run,id:`${kind}-${pages.length}-${run.id}`,bounds:{...run.bounds,xPt:left+run.bounds.xPt,yPt:at+run.bounds.yPt}});if(m.images.length){current.images??=[];for(const image of m.images)current.images.push({...image,xPt:left+image.xPt,yPt:at+image.yPt});}}
 };
 const ensureHeight=(height:number,id:string)=>{if(y+height>bottom+epsilon)nextPage();if(height>bottom-top+epsilon)throw new LayoutError(id,'Item exceeds page content height');};

 const emitLine=(line:MeasuredLine,x:number,at:number)=>{if(line.run)current.commands.push({...line.run,id:`run-${serial++}`,bounds:{...line.run.bounds,xPt:x+line.run.bounds.xPt,yPt:at}});};
 const measureBlock=async(id:string,width:number)=>{const n=d.nodes[id];if(n?.type!=='text-block')throw new LayoutError(id,'Expected a TextBlock');return measureText(n,d.styles[n.props.textStyleId]!,width,runtime);};
 const measureRow=async(row:TableRow,widths:number[]):Promise<Row>=>{
  const cells:Cell[]=[];
  for(const [i,id] of row.cellIds.entries()){
   const cell=d.nodes[id];if(cell?.type!=='table-cell')throw new LayoutError(id,'Expected a cell');
   const lines:MeasuredLine[]=[];for(const child of cell.childIds)lines.push(...await measureBlock(child,widths[i]!-2*pad));cells.push({id,lines});
  }
  return {id:row.id,allowBreak:row.props.allowBreak,cells,height:Math.max(0,...cells.map(c=>c.lines.reduce((sum,l)=>sum+l.heightPt,0)))+2*pad};
 };
 const table=async(t:Table)=>{
  if(d.nodeModelVersion>=9){
   await cellTableFlow(d,t,runtime,{get top(){return top;},get bottom(){return bottom;},get nextCapacity(){const g=geometry(sectionPageIndex);return g.bottom-g.top;},left,availableWidth:available,get y(){return y;},set y(v){y=v;},nextPage,
    emitItem(item,x,at,width){
     if(item.kind==='text-line'){emitLine(item.line,x,at);return;}
     const image=Object.hasOwn(images,item.resourceId)?images[item.resourceId]:undefined;
     if(!image)return;
     const fw=item.frameWidth,fh=item.heightPt,scale=Math.min(fw/image.width,fh/image.height),iw=image.width*scale,ih=image.height*scale;
     const frameLeft=x+(item.align==='right'?width-fw:item.align==='center'?(width-fw)/2:0);
     current.images??=[];current.images.push({nodeId:item.nodeId,resourceId:item.resourceId,xPt:frameLeft+(fw-iw)/2,yPt:at+(fh-ih)/2,widthPt:iw,heightPt:ih});
    },border(x1Pt,y1Pt,x2Pt,y2Pt,nodeId){current.borders??=[];current.borders.push({x1Pt,y1Pt,x2Pt,y2Pt,nodeId,widthPt:0.5,color:'000000'});}
   });return;
  }
  if(d.nodeModelVersion>=6&&t.rowIds.some(rid=>{const r=d.nodes[rid];return r?.type==='table-row'&&r.cellIds.some(cid=>{const c=d.nodes[cid];return c?.type==='table-cell'&&Object.keys(c.props).length>0;});})){
   await mergedTableFlow(d,t,runtime,{get top(){return top;},get bottom(){return bottom;},get nextCapacity(){const g=geometry(sectionPageIndex);return g.bottom-g.top;},left,availableWidth:available,get y(){return y;},set y(v){y=v;},nextPage,emitLine,border(x1Pt,y1Pt,x2Pt,y2Pt,nodeId){current.borders??=[];current.borders.push({x1Pt,y1Pt,x2Pt,y2Pt,nodeId,widthPt:0.5,color:'000000'});}});return;
  }
  const widths=t.columns.map(c=>toPt(c.width));
  if(widths.some(w=>w<=2*pad)||widths.reduce((a,b)=>a+b,0)>available+epsilon)throw new LayoutError(t.id,'Table columns exceed available content width');
  const rowAt=async(id:string)=>{const row=d.nodes[id];if(row?.type!=='table-row')throw new LayoutError(id,'Expected a row');return measureRow(row,widths);};
  const header=t.props.headerRowCount?await rowAt(t.rowIds[0]!):undefined;
  if(header&&header.height>bottom-top+epsilon)throw new LayoutError(header.id,'Header exceeds page content height');
  const drawRow=(row:Row,cursors:number[],counts:number[],height:number)=>{
   let x=left;current.borders??=[];
   const border=(x1:number,y1:number,x2:number,y2:number)=>current.borders!.push({x1Pt:x1,y1Pt:y1,x2Pt:x2,y2Pt:y2,widthPt:0.5,color:'000000',nodeId:row.id});
   // One perimeter and one separator per column avoid doubled vertical strokes.
   border(left,y,left+widths.reduce((a,b)=>a+b,0),y);border(left,y+height,left+widths.reduce((a,b)=>a+b,0),y+height);border(left,y,left,y+height);
   row.cells.forEach((cell,i)=>{let at=y+pad;for(const line of cell.lines.slice(cursors[i],cursors[i]!+counts[i]!)){emitLine(line,x+pad,at);at+=line.heightPt;}x+=widths[i]!;border(x,y,x,y+height);});y+=height;
  };
  const drawHeader=()=>{if(header)drawRow(header,header.cells.map(()=>0),header.cells.map(c=>c.lines.length),header.height);};
  const rows=t.rowIds.slice(t.props.headerRowCount);
  if(!rows.length){if(header){if(y+header.height>bottom+epsilon)nextPage();drawHeader();}return;}
  let started=false;
  for(const rowId of rows){
   const row=await rowAt(rowId),cursor=row.cells.map(()=>0);let first=true;
   while(first||row.cells.some((c,i)=>cursor[i]!<c.lines.length)){
    const minimum=row.allowBreak?Math.max(0,...row.cells.map((c,i)=>c.lines[cursor[i]!] ?.heightPt??0))+2*pad:row.height;
    const initialHeader=!started?(header?.height??0):0;
    if(y+initialHeader+minimum>bottom+epsilon){
     const repeatedHeader=!started||t.props.repeatHeaderRows?(header?.height??0):0;
     if(repeatedHeader+minimum>bottom-top+epsilon)throw new LayoutError(row.id,'Row or next whole line cannot fit with table header');
     nextPage();if(!started||t.props.repeatHeaderRows)drawHeader();started=true;
    }else if(!started){drawHeader();started=true;}
    const budget=bottom-y-2*pad,counts=row.cells.map(()=>0),heights=row.cells.map(()=>0);
    row.cells.forEach((cell,i)=>{for(let j=cursor[i]!;j<cell.lines.length;j++){const line=cell.lines[j]!;if(heights[i]!+line.heightPt>budget+epsilon)break;heights[i]!+=line.heightPt;counts[i]!++;}});
    if(row.cells.some((c,i)=>cursor[i]!<c.lines.length)&&counts.every(c=>c===0))throw new LayoutError(row.id,'Row made no progress');
    drawRow(row,cursor,counts,Math.max(0,...heights)+2*pad);
    counts.forEach((count,i)=>cursor[i]!+=count);first=false;
   }
  }
 };
 const sections=(d.nodeModelVersion===12||d.nodeModelVersion===13||d.nodeModelVersion===14||d.nodeModelVersion===15)?d.sections!:[{role:undefined,sourceKind:undefined,sectionId:undefined,page:d.book.page,rootIds:d.rootIds}];
 for(const section of sections){
 if((d.nodeModelVersion===12||d.nodeModelVersion===13||d.nodeModelVersion===14||d.nodeModelVersion===15)&&!section.rootIds.length&&!(d.nodeModelVersion>=13&&(section.role==='cover'||section.sourceKind==='blank')))continue;
 sectionId=section.sectionId;sectionPageIndex=0;cover=d.nodeModelVersion>=13&&section.role==='cover';pageRole=cover?'cover':section.sourceKind==='blank'?'blank':'body';setPage(section.page);innerTop=top;innerBottom=bottom;modes=section as typeof modes;bands={};
 activeBands=d.nodeModelVersion===15?section as Pick<ResolvedDocument,'header'|'footer'>:d;
 if(d.nodeModelVersion>=14&&pageRole==='body')for(const k of ['header','footer'] as const){const b=activeBands[k];if(!b||modes[k==='header'?'headerMode':'footerMode']==='none')continue;const key=(d.nodeModelVersion===15?sectionId+':':'')+k+':'+available;let m=bandCache.get(key);if(!m){try{m=await measurePageBand(b,d.styles,available,runtime,images);}catch(e){if(e instanceof LayoutError)throw new LayoutError(e.nodeId,e.message,sectionId,k+'.nodes.'+e.nodeId);throw e;}bandCache.set(key,m);}bands[k]=m;}
 nextPage();
 for(const id of section.rootIds){activeNode=id;const n=d.nodes[id];if(n?.type==='table')await table(n);else if(n?.type==='text-block'){
  if(n.props.heightMode==='fixed'){
   const measured=await measureFixedTextBlock(n,d.styles[n.props.textStyleId]!,available,runtime);
   if(y+measured.heightPt>bottom+epsilon)throw new LayoutError(id,'Reserved frame exceeds cover content area');
   let at=y+measured.offsetPt;for(const line of measured.lines){emitLine(line,left,at);at+=line.heightPt;}y+=measured.heightPt;continue;
  }
  for(const line of await measureBlock(id,available)){
   ensureHeight(line.heightPt,id);emitLine(line,left,y);y+=line.heightPt;
  }
 }else if(n?.type==='table-of-contents'){
  for(const measured of await measureContents(n,entries,d.styles[n.props.textStyleId]!,available,runtime)){
   const {line,xOffsetPt,numberSlot}=measured;
   ensureHeight(line.heightPt,n.id);
   emitLine(line,left+xOffsetPt,y);
   if(numberSlot)contentsSlots.push({nodeId:n.id,...numberSlot,pageIndex:pages.length-1,xPt:left+available-numberSlot.widthPt,yPt:y});
   y+=line.heightPt;
  }
 }else if(n?.type==='image'){
  const fw=toPt(n.props.width),fh=toPt(n.props.height);
  if(fw>available+epsilon)throw new LayoutError(id,'Image frame exceeds printable page');
  ensureHeight(fh,id);
  const image=Object.hasOwn(images,n.props.resourceId)?images[n.props.resourceId]:undefined;
  const frameLeft=left+(n.props.align==='right'?available-fw:n.props.align==='center'?(available-fw)/2:0);
  if(image){const scale=Math.min(fw/image.width,fh/image.height),iw=image.width*scale,ih=image.height*scale;current.images??=[];current.images.push({nodeId:id,resourceId:n.props.resourceId,xPt:frameLeft+(fw-iw)/2,yPt:y+(fh-ih)/2,widthPt:iw,heightPt:ih});}
  y+=fh;
 }else throw new LayoutError(id,'Unsupported root');}
 }
 assignCountedPages({pages});
 return {pages,...(contentsSlots.length?{contentsSlots}:{})};
}
