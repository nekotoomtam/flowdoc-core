// Private Core generated-package compaction rules; never an uploaded DOCX API.
import {parseGeneratedXml,serializeGeneratedXml} from './xml.mjs';
import {createHash} from 'node:crypto';
export const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const BOOL=new Set(['b','bCs','i','iCs']),KEYS=['b','bCs','i','iCs','rFonts','sz','szCs','snapToGrid','color','lang'];
const PKEYS=new Set(['keepNext','keepLines','pageBreakBefore','widowControl','spacing','jc','outlineLvl','tabs','ind','pBdr']);
const RORDER='rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange'.split(' ');
const sha=x=>createHash('sha256').update(x).digest('hex');
export const kids=n=>{const a=[];for(let c=n?.firstChild;c;c=c.nextSibling)if(c.nodeType===1)a.push(c);return a;};
const ch=(n,k)=>kids(n).find(c=>c.namespaceURI===W&&c.localName===k);
const a=(n,k,d='')=>n?.hasAttributeNS(W,k)?n.getAttributeNS(W,k):d;
const rm=n=>n?.parentNode?.removeChild(n);
const clean=n=>{if(n&&!n.firstChild)rm(n);};
const plain=n=>n?{ns:n.namespaceURI,name:n.nodeName,attrs:Array.from(n.attributes).map(x=>[x.namespaceURI,x.name,x.value]).sort((a,b)=>a[1].localeCompare(b[1])),children:Array.from(n.childNodes).map(c=>c.nodeType===1?plain(c):{type:c.nodeType,text:c.data})}:null;
const build=(doc,p)=>{const n=doc.createElementNS(p.ns,p.name);for(const [ns,k,v]of p.attrs)n.setAttributeNS(ns,k,v);for(const c of p.children)n.appendChild(c.name?build(doc,c):doc.createTextNode(c.text));return n;};
const node=(d,k,attrs={})=>{const e=d.createElementNS(W,'w:'+k);for(const [k,v]of Object.entries(attrs))e.setAttributeNS(W,'w:'+k,String(v));return e;};
const value=n=>{if(BOOL.has(n.localName)||n.localName==='snapToGrid')return !['false','0','off'].includes(a(n,'val','true'));return Array.from(n.attributes).map(x=>[x.namespaceURI,x.name,x.value]).sort((a,b)=>a[1].localeCompare(b[1]));};
const props=rp=>Object.fromEntries(kids(rp).filter(n=>n.namespaceURI===W&&KEYS.includes(n.localName)).map(n=>{if(kids(n).length)throw Error('UNSUPPORTED_PROPERTY_SUBTREE');return[n.localName,value(n)];}));
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const eq=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
export const parse=parseGeneratedXml;
export const elementCount=n=>{let total=0,stack=[n];while(stack.length){const v=stack.pop();if(v.nodeType===1)total++;for(let c=v.lastChild;c;c=c.previousSibling)stack.push(c);}return total;};
export function styleContext(raw){
 const d=parse(raw),root=d.documentElement,defs=new Map(),cache=new Map();if(root.namespaceURI!==W||root.localName!=='styles')throw Error('STYLE_ROOT');
 for(const s of kids(root).filter(x=>x.namespaceURI===W&&x.localName==='style')){const id=a(s,'styleId');if(defs.has(id))throw Error('STYLE_COLLISION');defs.set(id,{type:a(s,'type'),base:a(ch(s,'basedOn'),'val'),run:props(ch(s,'rPr')),runPlain:plain(ch(s,'rPr')),pPr:kids(ch(s,'pPr')).map(plain),default:['1','true'].includes(a(s,'default'))});}
 const dd=props(ch(ch(ch(root,'docDefaults'),'rPrDefault'),'rPr')),defaultId=[...defs].find(([id,s])=>s.type==='paragraph'&&s.default)?.[0]||'Normal';
 function chain(id,type,seen=new Set()){
  if(!id)return[];if(seen.has(id))throw Error('STYLE_CYCLE');seen.add(id);const s=defs.get(id);
  if(!s&&id==='DefaultParagraphFont'&&type==='character')return[];
  if(!s||s.type!==type)throw Error('UNKNOWN_STYLE:'+id);return [...chain(s.base,type,seen),s];
 }
 function styleApply(env,s){for(const [k,v]of Object.entries(s.run)){if(BOOL.has(k)){if(v)env[k]=!env[k];}else env[k]=v;}return env;}
 function base(id){if(cache.has(id))return {...cache.get(id)};const env={b:false,bCs:false,i:false,iCs:false,snapToGrid:true,...dd};for(const s of chain(id,'paragraph'))styleApply(env,s);cache.set(id,{...env});return env;}
 function inherited(id,rp,selected={}){const env={...base(id),...selected};for(const s of chain(a(ch(rp,'rStyle'),'val'),'character'))styleApply(env,s);return env;}
 function outline(id){let level;for(const s of chain(id,'paragraph')){const p=s.pPr.find(p=>p.ns===W&&p.name.split(':').pop()==='outlineLvl');if(p)level=p.attrs.find(([ns,name])=>ns===W&&name.split(':').pop()==='val')?.[2];}return level;}
 return {defs,defaultId,base,inherited,outline,generated:new Map(),characters:new Map(),registry:new Map(),originalNodes:elementCount(d)};
}
function setprop(rp,k,v){
 rm(ch(rp,k));const e=node(rp.ownerDocument,k);
 if(typeof v==='boolean')e.setAttributeNS(W,'w:val',v?'true':'false');else for(const[ns,name,val]of v)e.setAttributeNS(ns,name,val);
 const following=kids(rp).find(n=>RORDER.includes(n.localName)&&RORDER.indexOf(n.localName)>RORDER.indexOf(k));rp.insertBefore(e,following||null);
}
function ppr(p){let pp=ch(p,'pPr');if(!pp){pp=node(p.ownerDocument,'pPr');p.insertBefore(pp,p.firstChild);}return pp;}
function rpr(owner,mark){if(mark)owner=ppr(owner);let rp=ch(owner,'rPr');if(!rp){rp=node(owner.ownerDocument,'rPr');owner.insertBefore(rp,mark?ch(owner,'sectPr')||null:owner.firstChild);}return rp;}
function textDigest(doc){const h=createHash('sha256');for(const n of Array.from(doc.getElementsByTagNameNS(W,'t')).concat(Array.from(doc.getElementsByTagNameNS(W,'instrText'))))h.update(JSON.stringify([n.localName,n.textContent,a(n,'space'),n.getAttribute('xml:space')]));return h.digest('hex');}
export function planAndTransform(raw,ctx,progress=()=>{}){
 const doc=parse(raw);progress('parsed');const beforeNodes=elementCount(doc),textBefore=textDigest(doc),ledger={width:0,margins:0,borders:0,runProperties:0,paragraphs:0,compensations:0};
 // Direct width equality only; no grid/span/merge/layout edits.
 for(const t of Array.from(doc.getElementsByTagNameNS(W,'tbl'))){
  const tp=ch(t,'tblPr'),grid=ch(t,'tblGrid'),cols=kids(grid).filter(c=>c.localName==='gridCol').map(c=>Number(a(c,'w'))),rows=kids(t).filter(x=>x.localName==='tr');
  if(!cols.length||cols.some(v=>!Number.isFinite(v))||a(ch(tp,'tblLayout'),'type')!=='fixed')continue;
  for(const row of rows){const trp=ch(row,'trPr');if(ch(trp,'gridBefore')||ch(trp,'gridAfter'))continue;const cells=kids(row).filter(x=>x.localName==='tc');if(cells.reduce((n,c)=>n+Number(a(ch(ch(c,'tcPr'),'gridSpan'),'val','1')),0)!==cols.length)continue;
   let pos=0;for(const cell of cells){const cp=ch(cell,'tcPr'),span=Number(a(ch(cp,'gridSpan'),'val','1')),cw=ch(cp,'tcW'),width=cols.slice(pos,pos+span).reduce((a,b)=>a+b,0);pos+=span;if(cw&&a(cw,'type')==='dxa'&&Number(a(cw,'w'))===width){rm(cw);ledger.width++;clean(cp);}}
  }
 }
 progress('widths-planned',ledger);
 // Same scoped cell margin/border defaults as the reference recipe.
 for(const t of Array.from(doc.getElementsByTagNameNS(W,'tbl'))){const tp=ch(t,'tblPr'),cells=kids(t).filter(x=>x.localName==='tr').flatMap(tr=>kids(tr).filter(x=>x.localName==='tc')),prs=cells.map(c=>ch(c,'tcPr'));
  if(!tp||!cells.length||ch(tp,'tblStyle'))continue;
  const margins=prs.map(p=>ch(p,'tcMar'));
  if(margins.every(Boolean)&&!ch(tp,'tblCellMar')){const counts=new Map();for(const m of margins){const key=JSON.stringify(plain(m));counts.set(key,(counts.get(key)||0)+1);}const modal=[...counts].sort((a,b)=>b[1]-a[1])[0][0],chosen=margins.find(m=>JSON.stringify(plain(m))===modal),def=node(doc,'tblCellMar');for(const c of kids(chosen))def.appendChild(c.cloneNode(true));tp.insertBefore(def,ch(tp,'tblLook')||null);for(const m of margins)if(JSON.stringify(plain(m))===modal){ledger.margins+=elementCount(m);rm(m);}}
  const borders=prs.map(p=>ch(p,'tcBorders'));
  if(borders.every(Boolean)&&borders.every(b=>eq(plain(b),plain(borders[0])))){const edges=kids(borders[0]),attrs=n=>plain(n).attrs;if(edges.length===4&&['top','left','bottom','right'].every(k=>edges.some(e=>e.localName===k))&&edges.every(e=>eq(attrs(e),attrs(edges[0])))){const tb=node(doc,'tblBorders');for(const edge of ['top','left','bottom','right','insideH','insideV']){const e=node(doc,edge);for(const[ns,k,v]of attrs(edges[0]))e.setAttributeNS(ns,k,v);tb.appendChild(e);}const old=ch(tp,'tblBorders');if(old)tp.replaceChild(tb,old);else tp.insertBefore(tb,ch(tp,'tblLayout')||null);for(const b of borders){ledger.borders+=elementCount(b);rm(b);}}}
  for(const cp of prs)clean(cp);
  for(const tr of kids(t).filter(x=>x.localName==='tr')){const trp=ch(tr,'trPr');for(const n of kids(trp))if(['cantSplit','tblHeader'].includes(n.localName)&&['0','false','off'].includes(a(n,'val'))){rm(n);ledger.rowFalse=(ledger.rowFalse||0)+1;}clean(trp);}
 }
 progress('cell-defaults-planned',ledger);
 const paragraphs=Array.from(doc.getElementsByTagNameNS(W,'p'));
 for(const p of paragraphs){
  if(p.getElementsByTagNameNS(W,'p').length)continue;
  const pp=ch(p,'pPr'),base=a(ch(pp,'pStyle'),'val',ctx.defaultId),runs=Array.from(p.getElementsByTagNameNS(W,'r')).filter(r=>{let ancestor=r.parentNode;while(ancestor&&!(ancestor.namespaceURI===W&&ancestor.localName==='p'))ancestor=ancestor.parentNode;return ancestor===p;});
  // Word copies direct heading emphasis into refreshed TOC fields. Equal body
  // cascades are insufficient when emphasis is lifted into a paragraph style.
  // Preserve the source paragraph emphasis environment for every outline level;
  // explicit bold may use a character style, which Word carries into the field.
  const level=a(ch(pp,'outlineLvl'),'val',ctx.outline(base)),heading=/^[0-8]$/.test(level??'');
  const targets=runs.map(r=>({owner:r,mark:false,rp:ch(r,'rPr')}));targets.push({owner:p,mark:true,rp:ch(pp,'rPr')});
  const old=targets.map(t=>({...ctx.inherited(base,t.rp),...props(t.rp)})),selected={};
  for(const key of KEYS){if(heading&&BOOL.has(key))continue;const vals=old.map(v=>v[key]);if(vals.some(v=>v===undefined))continue;const counts=new Map();for(const v of vals){const s=JSON.stringify(v);counts.set(s,(counts.get(s)||0)+1);}const value=JSON.parse([...counts].sort((a,b)=>b[1]-a[1])[0][0]);if(!eq(value,ctx.base(base)[key]))selected[key]=value;}
  const moved=kids(pp).filter(n=>n.namespaceURI===W&&PKEYS.has(n.localName)),movedPlain=moved.map(plain);
  if(Object.keys(selected).length||moved.length){
   const key=JSON.stringify([base,movedPlain,selected]);let id=ctx.registry.get(key);
   if(!id){id='fdx'+sha(key).slice(0,18);if(ctx.defs.has(id)||ctx.generated.has(id))throw Error('STYLE_ID_COLLISION');ctx.registry.set(key,id);ctx.generated.set(id,{id,base,pPr:movedPlain,selected:{...selected},baseRun:ctx.base(base)});}
   for(const n of moved)rm(n);const prop=ppr(p);let ps=ch(prop,'pStyle');if(!ps){ps=node(doc,'pStyle');prop.insertBefore(ps,prop.firstChild);}ps.setAttributeNS(W,'w:val',id);
  }
  for(let i=0;i<targets.length;i++){const t=targets[i],env=ctx.inherited(base,t.rp,selected);let rp=t.rp;for(const key of KEYS){if(old[i][key]===undefined)continue;if(eq(old[i][key],env[key])){const n=ch(rp,key);if(n){ledger.runProperties+=elementCount(n);rm(n);}}else if(!eq(old[i][key],props(rp)[key])){rp=rpr(t.owner,t.mark);setprop(rp,key,old[i][key]);ledger.compensations++;}}
   if(!eq({...env,...props(rp)},old[i]))throw Error('EFFECTIVE_RUN_PROPERTIES_CHANGED');
   // A character-style true toggle is equivalent only over an inactive source
   // paragraph bit. Never replace an existing character style or invert an
   // inherited true bit. Keep all other direct properties (including cs).
   if(heading&&rp&&!ch(rp,'rStyle')&&!env.b&&!env.bCs&&props(rp).b===true&&props(rp).bCs===true){
    let character=ctx.characters.get('heading-bold');
    if(!character){const id='fdce'+sha('heading-bold:b=true,bCs=true').slice(0,18);if(ctx.defs.has(id)||ctx.generated.has(id))throw Error('CHARACTER_STYLE_COLLISION');character={id};ctx.characters.set('heading-bold',character);}
    rm(ch(rp,'b'));rm(ch(rp,'bCs'));rp.insertBefore(node(doc,'rStyle',{val:character.id}),rp.firstChild);
    if(!eq({...env,b:!env.b,bCs:!env.bCs,...props(rp)},old[i]))throw Error('CHARACTER_EMPHASIS_CHANGED');
   }
   clean(rp);
  }
  clean(ch(p,'pPr'));ledger.paragraphs++;if(ledger.paragraphs%128===0)progress('paragraph-plan-progress',ledger);
 }
 if(textDigest(doc)!==textBefore)throw Error('TEXT_CHANGED');
 progress('story-plan-complete',ledger);return {doc,beforeNodes,afterNodes:elementCount(doc),textBefore,ledger};
}
export function addStyles(raw,ctx){const doc=parse(raw);for(const def of ctx.generated.values()){const s=node(doc,'style',{type:'paragraph',styleId:def.id});s.appendChild(node(doc,'name',{val:def.id}));s.appendChild(node(doc,'basedOn',{val:def.base}));if(def.pPr.length){const pp=node(doc,'pPr');for(const p of def.pPr)pp.appendChild(build(doc,p));s.appendChild(pp);}if(Object.keys(def.selected).length){const rp=node(doc,'rPr');for(const [k,v]of Object.entries(def.selected).sort((a,b)=>RORDER.indexOf(a[0])-RORDER.indexOf(b[0])))setprop(rp,k,BOOL.has(k)?v!==!!def.baseRun[k]:v);s.appendChild(rp);}doc.documentElement.appendChild(s);}for(const def of ctx.characters.values()){const s=node(doc,'style',{type:'character',styleId:def.id}),rp=node(doc,'rPr');setprop(rp,'b',true);setprop(rp,'bCs',true);s.appendChild(rp);doc.documentElement.appendChild(s);}return doc;}
export const serialize=serializeGeneratedXml;
export const internals={ch,a,rm,clean,plain,build,node,eq,props,ppr,setprop,BOOL,PKEYS,KEYS};
