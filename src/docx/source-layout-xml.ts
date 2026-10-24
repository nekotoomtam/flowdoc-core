import {Paragraph,type IParagraphOptions,type IContext,type IXmlableObject} from 'docx';
import {sourceGuide,applySourceGuide,appliedSourceGuides,type SourceGuide,type SourceWord} from './source-layout.js';
import {fail,type ExportIntent} from './types.js';
import {hash} from './resources.js';
import {quantizeSourceRows,type SourceFrameCell} from './source-frame-budget.js';
import {toPoints} from './units.js';

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const esc=(s:string|number)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const pt=(n:number)=>{if(!Number.isFinite(n))fail('DOCX_GEOMETRY_UNREPRESENTABLE','source-layout','Nonfinite native canvas');return n.toFixed(6);};
class GuidedParagraph extends Paragraph {
 constructor(options:IParagraphOptions,private readonly tag:string,private readonly controlId:number){super(options);}
 override prepForXml(context:IContext):IXmlableObject|undefined{
  const paragraph=super.prepForXml(context);if(!paragraph)return undefined;
  // Serialize the actual Paragraph, including section properties added later by
  // the packer. A dummy wrapper paragraph would lose those section boundaries.
  return {'w:sdt':[{'w:sdtPr':[{'w:tag':[{_attr:{'w:val':this.tag}}]},{'w:id':[{_attr:{'w:val':this.controlId}}]}]},{'w:sdtContent':[paragraph]}]} as IXmlableObject;
 }
}
export function sourceParagraph(intent:ExportIntent,nodeId:string,eligible:boolean,options:IParagraphOptions):Paragraph{
 const guide=eligible?sourceGuide(intent,nodeId):undefined;if(!guide)return new Paragraph(options);
 const controlId=applySourceGuide(intent,guide);return new GuidedParagraph(options,guide.tag,controlId);
}

interface ZipLike {file(name:string):{async(kind:'string'):Promise<string>}|null;file(name:string,value:string):unknown;}
/** Candidate adapter: consume only private source guides, never caller XML hints. */
export async function serializeSourceLayout(intent:ExportIntent,zip:ZipLike,signal?:AbortSignal){
 const guides=appliedSourceGuides(intent);if(!guides.length)return false;
 // Only complete, ordinary source-guided grids participate. Keep a single
 // continuous row budget rather than independently round each cell's total.
 // This changes generated final line frames, never authored source metrics.
 const applied=new Map(guides.map(g=>[g.nodeId,g])),nodes=intent.document.nodes;
 for(const table of Object.values(nodes)){
  if(table.type!=='table')continue;
  const rows:SourceFrameCell[][]=[];let eligible=true;
  for(const rid of table.rowIds){
   const row=nodes[rid];if(row?.type!=='table-row'){eligible=false;break;}
   const cells:SourceFrameCell[]=[];
   for(const cid of row.cellIds){
    const cell=nodes[cid];if(cell?.type!=='table-cell'||cell.childIds.length!==1||(cell.props.rowSpan??1)!==1||(cell.props.colSpan??1)!==1){eligible=false;break;}
    const guide=applied.get(cell.childIds[0]!),padding=cell.props.padding;
    if(!guide||!guide.lines.length||[padding?.top,padding?.bottom].some(p=>p&&toPoints(p)!==4)){eligible=false;break;}
    cells.push({paddingPt:8,lines:guide.lines});
   }
   if(!eligible||!cells.length){eligible=false;break;}rows.push(cells);
  }
  if(eligible&&rows.length)quantizeSourceRows(rows);
 }
 const cancel=()=>{if(signal?.aborted)fail('DOCX_CANCELLED','options.signal','Export cancelled during source word serialization');};
 const document=zip.file('word/document.xml'),stylesPart=zip.file('word/styles.xml'),relsPart=zip.file('word/_rels/document.xml.rels'),typesPart=zip.file('[Content_Types].xml');
 if(!document||!stylesPart||!relsPart||!typesPart)fail('DOCX_SERIALIZATION_FAILED','package','Missing native package parts');
 const [original,styles,rels,types]=await Promise.all([document.async('string'),stylesPart.async('string'),relsPart.async('string'),typesPart.async('string')]);
 const byTag=new Map(guides.map(g=>[g.tag,g])),seen=new Set<string>(),nativeStyles=new Map<string,string>(),maps:string[]=[];
 let shape=0;
 const register=(kind:'paragraph'|'character',properties:string)=>{
  const id='fd'+kind[0]+hash(properties).slice(0,20);
  if(!nativeStyles.has(id))nativeStyles.set(id,`<w:style w:type="${kind}" w:styleId="${id}"><w:name w:val="${id}"/>${kind==='paragraph'?'<w:basedOn w:val="Normal"/>':''}${properties}</w:style>`);
  return id;
 };
 function characterStyle(g:SourceGuide,position:number,spacing:number|undefined,thai:boolean){
  const s=g.style,f=esc(s.font.family),flag=(name:string,on:boolean)=>on?`<w:${name}/>`:`<w:${name} w:val="false"/>`;
  const xml=`<w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}" w:eastAsia="${f}"/>${flag('b',s.bold)}${flag('bCs',s.bold)}${flag('i',s.italic)}${flag('iCs',s.italic)}<w:snapToGrid w:val="false"/><w:sz w:val="${s.sizeHalfPoints}"/><w:szCs w:val="${s.sizeHalfPoints}"/>${thai?'<w:cs/>':''}<w:position w:val="${position}"/><w:kern w:val="${spacing===undefined?s.sizeHalfPoints:0}"/>${spacing===undefined?'':`<w:spacing w:val="${spacing}"/>`}</w:rPr>`;
  return register('character',xml);
 }
 function wordRuns(g:SourceGuide,w:SourceWord,position:number){
  const runs:{text:string;style:string}[]=[];
  const emit=(text:string,spacing?:number,thai=false)=>{
   const style=characterStyle(g,position,spacing,thai),prior=runs.at(-1);
   if(prior?.style===style)prior.text+=text;else runs.push({text,style});
  };
  const ascii=/^[\u0020-\u007e]+$/.test(w.text)&&w.glyphs.length===w.text.length&&w.glyphs.every((v,i)=>v.clusterStartOffset===w.start+i&&v.clusterEndOffset===w.start+i+1&&v.offsetXPt===0&&v.offsetYPt===0);
  if(ascii){let residual=0,previous=0;for(let i=0;i<w.text.length;i++){const glyph=w.glyphs[i]!;residual+=(glyph.advancePt-g.font.advance(glyph.glyphId,g.style.sizeHalfPoints/2))*20;const at=Math.round(residual);emit(w.text[i]!,at-previous);previous=at;}}
  else emit(w.text,undefined,/[\u0e00-\u0e7f]/.test(w.text));
  return runs.map(r=>`<w:r><w:rPr><w:rStyle w:val="${r.style}"/></w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`).join('');
 }
 const output=original.replace(/<w:sdt(?:\s[^>]*)?>[\s\S]*?<\/w:sdt>/g,whole=>{
  const tag=/<w:tag\b[^>]*\bw:val="([^"]+)"/.exec(whole)?.[1],g=tag?byTag.get(tag):undefined;if(!g)return whole;
  cancel();if(seen.has(g.tag))fail('DOCX_SERIALIZATION_FAILED','source-layout','Duplicated source group');seen.add(g.tag);
  const originalPr=/<w:pPr(?:\s[^>]*)?>[\s\S]*?<\/w:pPr>/.exec(whole)?.[0];if(!originalPr)fail('DOCX_SERIALIZATION_FAILED','source-layout','Missing source paragraph properties');
  const sect=/<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(originalPr)?.[0]??'';
  const after=Number(/<w:spacing\b[^>]*\bw:after="(\d+)"/.exec(originalPr)?.[1]??0);
  let properties=originalPr.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g,'').replace(/<w:(?:keepNext|keepLines|ind|tabs)\b[^>]*\/>/g,'');
  // Paragraph-mark rPr supports a native character style. Share its unchanged
  // properties rather than repeat every font slot on each generated line.
  properties=properties.replace(/<w:rPr>[\s\S]*?<\/w:rPr>/,mark=>`<w:rPr><w:rStyle w:val="${register('character',mark)}"/></w:rPr>`);
  const paragraphs:string[]=[],lineMaps:string[]=[];const size=g.style.sizeHalfPoints/2;
  for(const [li,line]of g.lines.entries()){
   cancel();const height=line.frameTwips/20,spacing=`<w:spacing w:before="0" w:after="${li===g.lines.length-1?after:0}" w:line="${line.frameTwips}" w:lineRule="exact"/>`;
   const pr=properties.replace(/<w:spacing\b[^>]*\/>/,spacing).replace('</w:pPr>',(li===g.lines.length-1?sect:'')+'</w:pPr>');
   if(pr===properties&&!properties.includes(spacing))fail('DOCX_SERIALIZATION_FAILED','source-layout','Missing native source frame');
   const boxes:string[]=[],wordMaps:[string,number,number][]=[];
   for(const word of line.words){
    let cursor=0,left=0,right=word.advancePt;
    for(const glyph of word.glyphs){const ink=g.font.ink(glyph.glyphId);if(ink){left=Math.min(left,cursor+glyph.offsetXPt+ink.left*size/g.font.units);right=Math.max(right,cursor+glyph.offsetXPt+ink.right*size/g.font.units);}cursor+=glyph.advancePt;}
    const outward=(n:number)=>Math.ceil(Math.max(0,n)*2)/2+.5;
    const pl=outward(-left),pright=outward(right-word.advancePt),top=outward(g.font.winAscent*size/g.font.units-line.baselinePt),bottom=outward(g.font.winDescent*size/g.font.units-(height-line.baselinePt));
    const fullHeight=height+top+bottom,target=line.baselinePt+top,position=Math.floor(2*(fullHeight*4/5-target)+1e-9),innerLine=Math.round((target+position/2)*5/4*20);
    if(innerLine<1)fail('DOCX_GEOMETRY_UNREPRESENTABLE','source-layout','Invalid native inner frame');
    const pstyle=register('paragraph',`<w:pPr><w:spacing w:before="0" w:after="0" w:line="${innerLine}" w:lineRule="exact"/><w:jc w:val="left"/><w:ind w:left="${Math.round(pl*20)}"/></w:pPr>`);
    const id='fdword'+(++shape),x=word.xPt-pl-g.cellInsetPt,y=-top-g.cellInsetPt,width=word.advancePt+2*pl+pright;
    const style=`position:absolute;margin-left:${pt(x)}pt;margin-top:${pt(y)}pt;width:${pt(width)}pt;height:${pt(fullHeight)}pt;z-index:${10000+shape};mso-position-horizontal:absolute;mso-position-horizontal-relative:char;mso-position-vertical:absolute;mso-position-vertical-relative:text;mso-wrap-style:square;mso-wrap-distance-left:0pt;mso-wrap-distance-right:0pt;mso-wrap-distance-top:0pt;mso-wrap-distance-bottom:0pt`;
    boxes.push(`<w:r><w:pict><v:shape id="${id}" coordsize="21600,21600" o:spt="202" path="m,l,21600r21600,l21600,xe" style="${style}" filled="f" stroked="f" o:allowincell="t" o:allowoverlap="t"><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:f;mso-fit-text-to-shape:f;v-text-anchor:top"><w:txbxContent><w:p><w:pPr><w:pStyle w:val="${pstyle}"/></w:pPr>${wordRuns(g,word,position)}</w:p></w:txbxContent></v:textbox><w10:wrap type="none" anchorx="char" anchory="text"/></v:shape></w:pict></w:r>`);
    wordMaps.push([id,line.sourceStart+word.start,line.sourceStart+word.end]);
   }
   paragraphs.push(`<w:p>${pr}${boxes.join('')}</w:p>`);lineMaps.push(`<line index="${li}" start="${line.sourceStart}" end="${line.sourceEnd}" words="${esc(JSON.stringify(wordMaps))}"/>`);
  }
  maps.push(`<paragraph sourceNodeId="${esc(g.nodeId)}" nativeTag="${g.tag}" textSha256="${g.textDigest}" generatedFragments="${g.lines.length}">${lineMaps.join('')}</paragraph>`);
  return `<w:sdt xmlns:w="${W}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word"><w:sdtPr><w:tag w:val="${g.tag}"/><w:id w:val="${guides.indexOf(g)+1}"/></w:sdtPr><w:sdtContent>${paragraphs.join('')}</w:sdtContent></w:sdt>`;
 });
 if(seen.size!==guides.length)fail('DOCX_SERIALIZATION_FAILED','source-layout','Source group serialization coverage is incomplete');
 cancel();const name='customXml/flowdoc-paragraphs.xml',rid='rIdFlowDocSourceParagraphs';
 if(zip.file(name)||rels.includes(`Id="${rid}"`))fail('DOCX_SERIALIZATION_FAILED','source-layout','Source mapping part collision');
 const newStyles=styles.replace('</w:styles>',[...nativeStyles.values()].join('')+'</w:styles>');if(newStyles===styles)fail('DOCX_SERIALIZATION_FAILED','source-layout','Missing native styles root');
 zip.file('word/document.xml',output);zip.file('word/styles.xml',newStyles);
 zip.file(name,`<?xml version="1.0" encoding="UTF-8"?><flowdocParagraphs version="source-word/1" sourceDigest="${intent.sourceDigest}" generatedControls="line-paragraphs-word-boxes">${maps.join('')}</flowdocParagraphs>`);
 zip.file('word/_rels/document.xml.rels',rels.replace('</Relationships>',`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../${name}"/></Relationships>`));
 zip.file('[Content_Types].xml',types.replace('</Types>',`<Override PartName="/${name}" ContentType="application/xml"/></Types>`));
 return true;
}

/** Remove only redundant containers around adjacent generated VML shapes. */
export function compactSourceWordContainers(xml:string,tags:ReadonlySet<string>):string{
 return xml.replace(/<w:sdt(?:\s[^>]*)?>[\s\S]*?<\/w:sdt>/g,whole=>{
  const tag=/<w:tag\b[^>]*\bw:val="([^"]+)"/.exec(whole)?.[1];
  if(!tag||!tags.has(tag))return whole;
  return whole.replace(/(<\/v:shape>)<\/w:pict><\/w:r><w:r><w:pict>(?=<v:shape id="fdword\d+" )/g,'$1');
 });
}

export function compactSourceWordStyles(xml:string,styles:string,tags:ReadonlySet<string>){
 const definitions=new Map<string,{type:string;body:string}>(),added=new Map<string,string>();let compactedRuns=0;
 for(const m of styles.matchAll(/<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g)){
  const id=/\bw:styleId="([^"]+)"/.exec(m[1]!)?.[1],type=/\bw:type="([^"]+)"/.exec(m[1]!)?.[1];
  if(id&&type)definitions.set(id,{type,body:m[2]!});
 }
 const output=xml.replace(/<w:sdt(?:\s[^>]*)?>[\s\S]*?<\/w:sdt>/g,whole=>{
  const tag=/<w:tag\b[^>]*\bw:val="([^"]+)"/.exec(whole)?.[1];if(!tag||!tags.has(tag))return whole;
  return whole.replace(/<w:txbxContent><w:p><w:pPr><w:pStyle w:val="(fdp[^"]+)"\/><\/w:pPr><w:r><w:rPr><w:rStyle w:val="(fdc[^"]+)"\/><\/w:rPr>(<w:t\b[^>]*>[^<]*<\/w:t>)<\/w:r><\/w:p><\/w:txbxContent>/g,(box,pid:string,cid:string,text:string)=>{
   const base=definitions.get(pid),face=definitions.get(cid);if(base?.type!=='paragraph'||face?.type!=='character')return box;
   const properties=/<w:rPr>[\s\S]*?<\/w:rPr>/.exec(face.body)?.[0];if(!properties)return box;
   const id='fdp'+hash('source-uniform-style:'+pid+':'+cid).slice(0,20);
   if(definitions.has(id))fail('DOCX_SERIALIZATION_FAILED','source-layout.styles','Generated compact style collision');
   added.set(id,`<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${id}"/><w:basedOn w:val="${pid}"/>${properties}</w:style>`);compactedRuns++;
   return `<w:txbxContent><w:p><w:pPr><w:pStyle w:val="${id}"/></w:pPr><w:r>${text}</w:r></w:p></w:txbxContent>`;
  });
 });
 return {xml:output,styles:added.size?styles.replace('</w:styles>',[...added.values()].join('')+'</w:styles>'):styles,compactedRuns};
}
