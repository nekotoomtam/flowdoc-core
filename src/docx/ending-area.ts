import {BuilderElement,Run,Paragraph,LineRuleType,StringContainer} from 'docx';
import {MappingError,type ExportIntent} from './types.js';
import {toPoints} from './units.js';
import {textEnvelope} from './font-envelope.js';
import {measuredReadingExtent} from './reading-measurements.js';
export function endingAreaAnchor(id:number){
 const run=new Run({size:2,sizeComplexScript:2,snapToGrid:false});
 run.addChildElement(new BuilderElement({name:'w:footnoteReference',attributes:{id:{key:'w:id',value:id},mark:{key:'w:customMarkFollows',value:1}}}));
 run.addChildElement(new StringContainer('w:t','\u200B'));
 return new Paragraph({children:[run],run:{size:2,sizeComplexScript:2},spacing:{before:0,after:0,line:20,lineRule:LineRuleType.EXACT},widowControl:false});
}
/** Conservative native envelope used only to keep a short ending Area together. */
export function endingAreaEnvelope(intent:ExportIntent,ids:readonly string[],width:number):number {
 const nodes:any=intent.document.nodes;
 const block=(id:string,w:number):number=>{
  const n=nodes[id];
  if(n.type==='text-block'){
   if(n.props.heightMode==='fixed')return toPoints(n.props.height);
   const m=measuredReadingExtent(intent,'nodes',id,w);if(m)return Math.ceil(m.height*20)/20+m.lines;
   try{return textEnvelope(intent,id,'nodes',w);}catch(error){if(error instanceof MappingError&&error.issue.code==='DOCX_CAPABILITY_UNSUPPORTED')return Infinity;throw error;}
  }
  if(n.type==='image')return toPoints(n.props.height)+1;
  if(n.type==='line')return toPoints(n.props.spaceBefore??{value:0,unit:'pt'})+toPoints(n.props.thickness??{value:.5,unit:'pt'})+toPoints(n.props.spaceAfter??{value:0,unit:'pt'});
  if(n.type==='table'){
   const t=intent.tables.find(t=>t.nodeId===id)!;
   return n.rowIds.reduce((total:number,rid:string)=>total+Math.max(1,...nodes[rid].cellIds.map((cid:string,index:number)=>{
    const c=nodes[cid],pad=t.cells.find(c=>c.nodeId===cid)!.paddingTwips,col=c.props.columnIndex??index,span=c.props.colSpan??1,cw=(t.columnTwips.slice(col,col+span).reduce((a,b)=>a+b,0)-pad.left-pad.right)/20;
    return (pad.top+pad.bottom)/20+c.childIds.reduce((sum:number,child:string)=>sum+block(child,cw),0)+1;
   })),0)+1;
  }return Infinity;
 };
 return ids.reduce((sum,id)=>sum+block(id,width),0);
}
/** Rewrite only the generated note parts; ordinary packages stay byte-identical. */
export async function finishEndingAreas(zip:any,areas:{keepTogether:boolean}[]){
 const notes=zip.file('word/footnotes.xml');if(!notes)throw Error('Missing ending Area note part');
 const empty='<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr></w:p>';
 let xml=await notes.async('string');
 xml=xml.replace(/(<w:footnote\b[^>]*w:type="(?:separator|continuationSeparator)"[^>]*>)[\s\S]*?<\/w:footnote>/g,(_m:string,open:string)=>open+empty+'</w:footnote>');
 xml=xml.replace(/<w:footnoteRef\s*\/>/g,'');zip.file('word/footnotes.xml',xml);
 xml=xml.replace(/(<w:footnote\b[^>]*w:id="(\d+)"[^>]*>)([\s\S]*?)<\/w:footnote>/g,(whole:string,open:string,id:string,content:string)=>{
  if(!areas[Number(id)-1]?.keepTogether)return whole;
  const paragraphs=[...content.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)];let index=0;
  return open+content.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g,p=>{
   const properties=(index++<paragraphs.length-1?'<w:keepNext/>':'')+'<w:keepLines/>';
   p=p.replace(/<w:keep(?:Next|Lines)\b[^>]*\/>/g,'');
   return p.includes('<w:pPr>')?p.replace(/(<w:pPr>(?:<w:pStyle\b[^>]*\/>)?)/,'$1'+properties):p.replace(/(<w:p(?:\s[^>]*)?>)/,'$1<w:pPr>'+properties+'</w:pPr>');
  })+'</w:footnote>';
 });zip.file('word/footnotes.xml',xml);
 const settings=zip.file('word/settings.xml'),original=await settings.async('string');
 const pos='<w:pos w:val="pageBottom"/>';
 zip.file('word/settings.xml',original.includes('<w:footnotePr>')?original.replace('<w:footnotePr>','<w:footnotePr>'+pos):original.replace('</w:settings>','<w:footnotePr>'+pos+'</w:footnotePr></w:settings>'));
}
