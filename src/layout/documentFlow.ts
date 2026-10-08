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
 if(d.rootIds.every(id=>d.nodes[id]?.type==='text-block'))return textFlow(d,runtime);
 const page=d.book.page,[w,h]=page.orientation==='portrait'?[210,297]:[297,210];
 const widthPt=w!*72/25.4,heightPt=h!*72/25.4,left=toPt(page.margin.left),top=toPt(page.margin.top),bottom=heightPt-toPt(page.margin.bottom),available=widthPt-left-toPt(page.margin.right);
 const pages:DrawPage[]=[];let current!:DrawPage,y=top,serial=0;
 const nextPage=()=>{current={widthPt,heightPt,backgroundColor:'FFFFFF',commands:[]};pages.push(current);y=top;};nextPage();
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
 for(const id of d.rootIds){const n=d.nodes[id];if(n?.type==='table')await table(n);else if(n?.type==='text-block'){
  for(const line of await measureBlock(id,available)){
   if(line.heightPt>bottom-top+epsilon)throw new LayoutError(id,'Line exceeds page height');if(y+line.heightPt>bottom+epsilon)nextPage();emitLine(line,left,y);y+=line.heightPt;
  }
 }else if(n?.type==='image'){
  const fw=toPt(n.props.width),fh=toPt(n.props.height);
  if(fw>available+epsilon||fh>bottom-top+epsilon)throw new LayoutError(id,'Image frame exceeds printable page');
  if(y+fh>bottom+epsilon)nextPage();
  const image=Object.hasOwn(images,n.props.resourceId)?images[n.props.resourceId]:undefined;
  if(image){const scale=Math.min(fw/image.width,fh/image.height),iw=image.width*scale,ih=image.height*scale;current.images??=[];current.images.push({nodeId:id,resourceId:n.props.resourceId,xPt:left+(fw-iw)/2,yPt:y+(fh-ih)/2,widthPt:iw,heightPt:ih});}
  y+=fh;
 }else throw new LayoutError(id,'Unsupported root');}
 return {pages};
}
