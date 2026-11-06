import {createHash} from 'node:crypto';
import {splitStory} from './bounded-story.mjs';
import {W,kids,internals as I,planAndTransform,parse,serialize,elementCount} from './planner.mjs';
import {advanced,fingerprint} from './advanced.mjs';
const {ch,a}=I,RR='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const sha=x=>createHash('sha256').update(x).digest('hex');
function shell(raw){const s=splitStory(raw),d=parse(s.prefix+s.suffix),root=d.documentElement;
 if(root.namespaceURI!==W||root.localName!==s.rootName.split(':').at(-1))throw Error('ROOT_NAMESPACE');
 const body=root.localName==='document'?kids(root).find(n=>n.namespaceURI===W&&n.localName==='body'):root;
 if(!body)throw Error('BODY_NAMESPACE');
 let cursor=s.contentStart;const gaps=[];for(const u of s.units){gaps.push(raw.slice(cursor,u.start));cursor=u.end;}gaps.push(raw.slice(cursor,s.contentEnd));
 return {s,count:elementCount(d),fingerprint:fingerprint(d),gapDigest:sha(JSON.stringify(gaps))};
}
const sum=(a,b)=>{for(const [k,v]of Object.entries(b))a[k]=(a[k]??0)+v;};
function transform(raw,ctx,phase){const p=planAndTransform(raw,ctx);const ledger=phase==='tally'?{}:advanced(p.doc,ctx);return {doc:p.doc,baseLedger:p.ledger,ledger};}
function unitInfo(wrapped,ctx,phase){
 const p=transform(wrapped,ctx,phase),counts=new Map(),referenceCounts=new Map();
 for(const n of Array.from(p.doc.getElementsByTagName('*')))for(const attr of Array.from(n.attributes))if(attr.namespaceURI===RR&&['id','embed','link'].includes(attr.localName))referenceCounts.set(attr.value,(referenceCounts.get(attr.value)??0)+1);
 for(const n of Array.from(p.doc.getElementsByTagNameNS(W,'p'))){const id=a(ch(ch(n,'pPr'),'pStyle'),'val');counts.set(id,(counts.get(id)??0)+1);}
 const refs=Array.from(p.doc.getElementsByTagNameNS(W,'sectPr')).map(s=>{const entries=kids(s).filter(x=>x.namespaceURI===W&&x.localName==='footerReference').map(x=>[a(x,'type'),x.getAttributeNS(RR,'id')]);if(new Set(entries.map(e=>e[0])).size!==entries.length)throw Error('FOOTER_REFERENCE_DUPLICATE');return Object.fromEntries(entries);});
 return {fingerprint:fingerprint(p.doc),nodes:elementCount(p.doc),textEmpty:!p.doc.documentElement.textContent.trim(),styleCounts:[...counts],referenceCounts:[...referenceCounts],refs,baseLedger:p.baseLedger,ledger:p.ledger};
}
function* planSteps(raw,ctx,phase){
 const {s,count,fingerprint:shellFingerprint,gapDigest}=shell(raw),unitPlans=[],styleCounts=new Map(),referenceCounts=new Map(),sections=[],baseLedger={},ledger={};let nodes=count,textEmpty=true;
 for(const u of s.units){const p=unitInfo(s.prefix+raw.slice(u.start,u.end)+s.suffix,ctx,phase);nodes+=p.nodes-count;textEmpty&&=p.textEmpty;unitPlans.push({fingerprint:p.fingerprint,nodes:p.nodes-count});
  for(const [id,n]of p.styleCounts)styleCounts.set(id,(styleCounts.get(id)??0)+n);
  for(const[id,n]of p.referenceCounts)referenceCounts.set(id,(referenceCounts.get(id)??0)+n);
  for(const refs of p.refs)sections.push({index:sections.length,refs});sum(baseLedger,p.baseLedger);sum(ledger,p.ledger);
  if(ctx.generated.size>256||ctx.characters.size>16||ctx.tables?.size>256||ctx.columns?.size>256)throw Error('COMPACTION_STYLE_LIMIT');yield;
 }
 return {nodes,textEmpty,styleCounts:[...styleCounts],referenceCounts:[...referenceCounts],sections,unitPlans,baseLedger,ledger,shellFingerprint,gapDigest,fingerprint:sha(JSON.stringify([shellFingerprint,gapDigest,unitPlans])),maxUnitNodes:Math.max(0,...s.units.map(u=>u.elements))};
}
function* emitSteps(raw,ctx,expected){
 const {s,count,fingerprint:shellFingerprint,gapDigest}=shell(raw);if(gapDigest!==expected.gapDigest||expected.unitPlans.length!==s.units.length||shellFingerprint!==expected.shellFingerprint)throw Error('SHELL_PLAN_DRIFT');
 const chunks=[];let cursor=s.contentStart;
 function emit(u,i){
  const wrapped=s.prefix+raw.slice(u.start,u.end)+s.suffix,before=fingerprint(parse(wrapped)),p=transform(wrapped,ctx,'emit'),fp=fingerprint(p.doc);
  if(fp!==expected.unitPlans[i].fingerprint||elementCount(p.doc)-count!==expected.unitPlans[i].nodes)throw Error('UNIT_PLAN_DRIFT');
  if(fp===before)return raw.slice(u.start,u.end);
  const serialized=serialize(p.doc),framed=splitStory(serialized);if(framed.units.length!==1)throw Error('UNIT_SERIALIZE_SHAPE');const [piece]=framed.units;
  const value=serialized.slice(piece.start,piece.end),reparsed=parse(s.prefix+value+s.suffix);
  if(fingerprint(reparsed)!==fp)throw Error('UNIT_ROUNDTRIP_CHANGED');return value;
 }
 for(const [i,u]of s.units.entries()){chunks.push(raw.slice(cursor,u.start),emit(u,i));cursor=u.end;yield;}
 chunks.push(raw.slice(cursor,s.contentEnd));return s.prefix+chunks.join('')+s.suffix;
}

const drive=steps=>{let step=steps.next();while(!step.done)step=steps.next();return step.value;};
async function driveAsync(steps,checkpoint){try{let step=steps.next();while(!step.done){await checkpoint();step=steps.next();}return step.value;}finally{steps.return();}}
export const planStory=(raw,ctx,{phase='plan'}={})=>drive(planSteps(raw,ctx,phase));
export const emitStory=(raw,ctx,expected)=>drive(emitSteps(raw,ctx,expected));
export const planStoryAsync=(raw,ctx,phase,checkpoint)=>driveAsync(planSteps(raw,ctx,phase),checkpoint);
export const emitStoryAsync=(raw,ctx,expected,checkpoint)=>driveAsync(emitSteps(raw,ctx,expected),checkpoint);
