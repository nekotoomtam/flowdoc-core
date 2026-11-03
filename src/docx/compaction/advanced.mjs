import {createHash} from 'node:crypto';import {W,kids,internals as I,parse,addStyles} from './planner.mjs';
const {ch,a,rm,clean,plain,build,node,eq,ppr}=I,A='http://schemas.openxmlformats.org/drawingml/2006/main',WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',PIC='http://schemas.openxmlformats.org/drawingml/2006/picture';
const hash=s=>createHash('sha256').update(s).digest('hex');
export function prepareAdvanced(ctx,styleCounts){
 ctx.promoted=[...styleCounts].sort((a,b)=>b[1]-a[1])[0]?.[0];if(!ctx.generated.has(ctx.promoted))throw Error('UNKNOWN_DEFAULT_CANDIDATE');
 ctx.tables=new Map();ctx.columns=new Map();ctx.dropDefaultJc=false;
 ctx.pprops=(id,drop=false,seen=new Set())=>{if(!id)return{};if(seen.has(id))throw Error('STYLE_CYCLE');seen.add(id);const s=ctx.generated.get(id)||ctx.defs.get(id);if(!s)throw Error('UNKNOWN_PARAGRAPH_STYLE:'+id);const value={...ctx.pprops(s.base,drop,seen)};for(const p of s.pPr||[])if(!(drop&&id===ctx.promoted&&p.name==='w:jc'))value[p.name]=p;return value;};
 // Compare generated direct rPr using a tiny DOM only; no main story retained.
 const styles=addStyles('<w:styles xmlns:w="'+W+'"/>',ctx);ctx.runSigs=new Map(kids(styles.documentElement).map(s=>[a(s,'styleId'),JSON.stringify(plain(ch(s,'rPr')))]));
 const dp=ctx.pprops(ctx.promoted);ctx.centerIds=new Set();
 if(dp['w:jc']?.attrs.some(x=>x[1]==='w:val'&&x[2]==='left'))for(const [id,s]of ctx.generated){const pp=ctx.pprops(id),without=o=>Object.fromEntries(Object.entries(o).filter(([k])=>k!=='w:jc'));if(s.pPr.some(p=>p.name==='w:jc'&&p.attrs.some(x=>x[1]==='w:val'&&x[2]==='center'))&&eq(without(pp),without(dp))&&ctx.runSigs.get(id)===ctx.runSigs.get(ctx.promoted))ctx.centerIds.add(id);}
}
export function advanced(doc,ctx){
 if(doc.getElementsByTagNameNS(W,'bidi').length||doc.getElementsByTagNameNS(W,'bidiVisual').length)throw Error('UNSUPPORTED_BIDI_CONTEXT');
 const ledger={tableStyles:0,defaultRefs:0,frozenImplicit:0,columnRefs:0,compensations:0,snap:0,extent:0,adjust:0};
 for(const t of Array.from(doc.getElementsByTagNameNS(W,'tbl'))){const tp=ch(t,'tblPr');if(!tp||ch(tp,'tblStyle'))continue;const move=kids(tp).filter(n=>['tblInd','tblBorders','tblCellMar'].includes(n.localName)),defs=move.map(plain),key=JSON.stringify(defs);let ts=ctx.tables.get(key);if(!ts){const id='fdts'+hash(key).slice(0,18);if(ctx.defs.has(id)||ctx.generated.has(id))throw Error('TABLE_STYLE_COLLISION');ts={id,props:defs};ctx.tables.set(key,ts);}for(const n of move)rm(n);tp.insertBefore(node(doc,'tblStyle',{val:ts.id}),tp.firstChild);ledger.tableStyles++;}
 for(const p of Array.from(doc.getElementsByTagNameNS(W,'p'))){const pp=ch(p,'pPr'),ps=ch(pp,'pStyle');if(!ps){ppr(p).insertBefore(node(doc,'pStyle',{val:ctx.defaultId}),ppr(p).firstChild);ledger.frozenImplicit++;}else if(a(ps,'val')===ctx.promoted){rm(ps);clean(pp);ledger.defaultRefs++;}}
 const jc=(p,id,drop=false,goal='left')=>a(ch(ch(p,'pPr'),'jc'),'val')||ctx.pprops(id,drop)['w:jc']?.attrs.find(x=>x[1]==='w:val')?.[2]||goal;
 if(ctx.centerIds.size)for(const t of Array.from(doc.getElementsByTagNameNS(W,'tbl'))){
  if(Array.from(t.getElementsByTagNameNS(W,'gridSpan')).some(x=>Number(a(x,'val','1'))>1))continue;
  const tp=ch(t,'tblPr'),ts=ch(tp,'tblStyle'),cols=kids(ch(t,'tblGrid')).length;let valid=cols>1&&!!ts;const entries=[];
  for(const row of kids(t).filter(x=>x.localName==='tr')){const cells=kids(row).filter(x=>x.localName==='tc');if(ch(ch(row,'trPr'),'gridBefore')||ch(ch(row,'trPr'),'gridAfter'))valid=false;let width=0;
   for(let ci=0;ci<cells.length;ci++){const cell=cells[ci];width+=Number(a(ch(ch(cell,'tcPr'),'gridSpan'),'val','1'));for(const p of Array.from(cell.getElementsByTagNameNS(W,'p'))){let ancestor=p.parentNode;while(ancestor&&!(ancestor.namespaceURI===W&&ancestor.localName==='tbl'))ancestor=ancestor.parentNode;if(ancestor!==t)continue;const id=a(ch(ch(p,'pPr'),'pStyle'),'val',ctx.promoted),props=ctx.pprops(id),direct=ch(ch(p,'pPr'),'jc');entries.push({p,id,old:jc(p,id),first:ci===0,last:ci===cells.length-1,mutable:!direct&&(id===ctx.promoted||!props['w:jc'])});}}
   if(width!==cols)valid=false;
  }
  if(!valid||!entries.some(e=>ctx.centerIds.has(e.id)))continue;
  const target=(mode,e)=>e.first&&e.last&&mode[1]!==mode[2]?null:e.last?mode[2]:e.first?mode[1]:mode[0];
  const score=mode=>entries.reduce((n,e)=>{const goal=target(mode,e);return n+(ctx.centerIds.has(e.id)&&goal==='center'?1+(kids(ch(e.p,'pPr')).length===1?1:0):e.mutable&&(goal===null||goal!==e.old)?-1-(ch(e.p,'pPr')?0:1):0);},0);
  const modes=[];for(const b of ['left','center'])for(const f of ['left','center'])for(const l of ['left','center'])modes.push([b,f,l]);modes.sort((a,b)=>score(b)-score(a));const mode=modes[0];if(score(mode)<=0)continue;
  const base=a(ts,'val'),key=JSON.stringify([base,mode]);let c=ctx.columns.get(key);if(!c){const id='fdcol'+hash(key).slice(0,18);if(ctx.defs.has(id)||ctx.generated.has(id))throw Error('COLUMN_STYLE_COLLISION');c={id,base,mode};ctx.columns.set(key,c);}ts.setAttributeNS(W,'w:val',c.id);ctx.dropDefaultJc=true;
  let look=ch(tp,'tblLook');if(!look){look=node(doc,'tblLook');tp.appendChild(look);}for(const[k,v]of Object.entries({val:'0780',firstRow:'0',lastRow:'0',firstColumn:'1',lastColumn:'1',noHBand:'1',noVBand:'1'}))look.setAttributeNS(W,'w:'+k,v);
  for(const e of entries){const goal=target(mode,e);if(goal==='center'&&ctx.centerIds.has(e.id)){const ps=ch(ch(e.p,'pPr'),'pStyle');rm(ps);clean(ch(e.p,'pPr'));ledger.columnRefs++;}const id=a(ch(ch(e.p,'pPr'),'pStyle'),'val',ctx.promoted),now=jc(e.p,id,true,goal);
   if(now!==e.old){const pp=ppr(e.p);let direct=ch(pp,'jc');if(!direct){direct=node(doc,'jc');pp.insertBefore(direct,ch(pp,'rPr')||ch(pp,'sectPr')||null);}direct.setAttributeNS(W,'w:val',e.old);ledger.compensations++;}if(jc(e.p,id,true,goal)!==e.old)throw Error('ALIGNMENT_CHANGED');}
 }
 // Every story is planned before publication; an operative character grid
 // anywhere makes the entire global-default family ineligible.
 for(const n of Array.from(doc.getElementsByTagNameNS(W,'docGrid')))if(n.hasAttributeNS(W,'charSpace')||!['default','lines'].includes(a(n,'type','default')))throw Error('OPERATIVE_CHARACTER_GRID');
 for(const rp of Array.from(doc.getElementsByTagNameNS(W,'rPr'))){const snap=ch(rp,'snapToGrid');if(snap){rm(snap);ledger.snap++;}clean(rp);}
 for(const inline of Array.from(doc.getElementsByTagNameNS(WP,'inline'))){if(['effectDag','outerShdw','innerShdw','glow','softEdge','reflection'].some(k=>inline.getElementsByTagNameNS(A,k).length)||Array.from(inline.getElementsByTagNameNS(A,'effectLst')).some(n=>n.childNodes.length))continue;for(const n of kids(inline))if(n.namespaceURI===WP&&n.localName==='effectExtent'&&n.attributes.length===4&&['l','t','r','b'].every(k=>n.getAttribute(k)==='0')){rm(n);ledger.extent++;}}
 for(const g of Array.from(doc.getElementsByTagNameNS(A,'prstGeom')))if(g.getAttribute('prst')==='rect')for(const n of kids(g))if(n.namespaceURI===A&&n.localName==='avLst'&&!n.attributes.length&&!n.childNodes.length){rm(n);ledger.adjust++;}
 // Core's flat inline pictures have no group-coordinate inheritance. These
 // optional children express the same full-fill/zero-origin defaults when
 // absent. Keep explicit offsets for active/unknown transforms, and keep any
 // rectangle with attributes, content or comments. Never apply to anchors.
 const child=(n,ns,name)=>kids(n).find(c=>c.namespaceURI===ns&&c.localName===name);
 for(const inline of Array.from(doc.getElementsByTagNameNS(WP,'inline'))){
  const graphic=child(inline,A,'graphic'),data=child(graphic,A,'graphicData');
  if(data?.getAttribute('uri')!==PIC||kids(data).length!==1)continue;
  const pic=child(data,PIC,'pic');if(!pic)continue;
  const stretch=child(child(pic,PIC,'blipFill'),A,'stretch'),rect=child(stretch,A,'fillRect');
  if(stretch&&!stretch.attributes.length&&stretch.childNodes.length===1&&rect&&!rect.attributes.length&&!rect.childNodes.length){rm(rect);ledger.fillRect=(ledger.fillRect||0)+1;}
  const xf=child(child(pic,PIC,'spPr'),A,'xfrm'),off=child(xf,A,'off'),ext=child(xf,A,'ext');
  if(xf&&!xf.attributes.length&&xf.childNodes.length===2&&xf.firstChild===off&&xf.lastChild===ext&&off?.attributes.length===2&&off.getAttribute('x')==='0'&&off.getAttribute('y')==='0'&&!off.childNodes.length&&ext?.attributes.length===2&&['cx','cy'].every(k=>/^\d+$/.test(ext.getAttribute(k)))&&!ext.childNodes.length){rm(off);ledger.offset=(ledger.offset||0)+1;}
 }
 return ledger;
}
export function finalStyles(raw,ctx){
 const doc=addStyles(raw,ctx),root=doc.documentElement,originalDefault=kids(root).find(s=>a(s,'styleId')===ctx.defaultId);originalDefault.setAttributeNS(W,'w:default','0');
 for(const s of kids(root).filter(s=>ctx.generated.has(a(s,'styleId')))){rm(ch(s,'name'));if(a(s,'styleId')===ctx.promoted){s.setAttributeNS(W,'w:default','1');if(ctx.dropDefaultJc)rm(ch(ch(s,'pPr'),'jc'));}}
 for(const t of ctx.tables.values()){const s=node(doc,'style',{type:'table',styleId:t.id});s.appendChild(node(doc,'basedOn',{val:'TableNormal'}));const tp=node(doc,'tblPr');for(const p of t.props)tp.appendChild(build(doc,p));s.appendChild(tp);root.appendChild(s);}
 for(const c of ctx.columns.values()){const s=node(doc,'style',{type:'table',styleId:c.id});s.appendChild(node(doc,'basedOn',{val:c.base}));const pp=node(doc,'pPr');pp.appendChild(node(doc,'jc',{val:c.mode[0]}));s.appendChild(pp);for(const[typ,val]of [['firstCol',c.mode[1]],['lastCol',c.mode[2]]])if(val!==c.mode[0]){const cond=node(doc,'tblStylePr',{type:typ}),p=node(doc,'pPr');p.appendChild(node(doc,'jc',{val}));cond.appendChild(p);s.appendChild(cond);}root.appendChild(s);}
 for(const s of kids(root).filter(n=>n.localName==='style'))for(const rp of Array.from(s.getElementsByTagNameNS(W,'rPr'))){for(const n of kids(rp))if((['b','bCs','i','iCs'].includes(n.localName)&&['0','false','off'].includes(a(n,'val')))||n.localName==='snapToGrid')rm(n);clean(rp);}
 return doc;
}
export function fingerprint(doc){const h=createHash('sha256');function walk(n){if(n.nodeType===1){h.update(JSON.stringify([n.namespaceURI,n.localName,Array.from(n.attributes).map(a=>[a.namespaceURI,a.name,a.value]).sort()]));for(let c=n.firstChild;c;c=c.nextSibling)walk(c);h.update('E');}else if([3,4,7,8].includes(n.nodeType))h.update(JSON.stringify([n.nodeType,n.data]));}walk(doc.documentElement);return h.digest('hex');}
