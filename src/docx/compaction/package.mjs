import {posix} from 'node:path';
import {W,kids,internals as I,styleContext,elementCount,parse,serialize} from './planner.mjs';
import {prepareAdvanced,finalStyles,fingerprint} from './advanced.mjs';
import {planStoryAsync,emitStoryAsync} from './bounded-transform.mjs';
const {ch,a,rm}=I,RR='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const count=s=>(s.match(/<(?![!?/])[A-Za-z_][\w:.-]*(?=[\s/>])/g)||[]).length;
const decode=bytes=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
const xmlPart=n=>/\.(xml|rels)$/.test(n);
const storyPart=n=>/^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/.test(n);
const nonStoryWord=/^word\/(styles|settings|numbering|fontTable|webSettings|theme\/theme1)\.xml$/;
async function text(zip,name,max=32*1048576){const entry=zip.file(name);if(!entry)throw Error('MISSING_PART:'+name);const bytes=await entry.async('uint8array');if(bytes.byteLength>max)throw Error('COMPACTION_PART_LIMIT');return decode(bytes);}
function checkStyleBounds(raw,doc){if(Buffer.byteLength(raw)>256*1024||elementCount(doc)>4096)throw Error('COMPACTION_STYLE_LIMIT');}
export function readStyleIds(raw){if(Buffer.byteLength(raw)>256*1024)throw Error('COMPACTION_STYLE_LIMIT');const doc=parse(raw);checkStyleBounds(raw,doc);if(doc.documentElement.namespaceURI!==W||doc.documentElement.localName!=='styles')throw Error('STYLE_ROOT');const ids=[];for(const n of kids(doc.documentElement))if(n.namespaceURI===W&&n.localName==='style'){const id=a(n,'styleId');if(!id||ids.includes(id))throw Error('STYLE_COLLISION');ids.push(id);}return ids;}
export async function countPackage(zip){let total=0;for(const n of Object.keys(zip.files))if(xmlPart(n))total+=count(await text(zip,n));return total;}
export async function planGeneratedPackage(zip,context,xmlBudget,checkpoint){
 if(context.sourceSerialized!==true)throw Error('COMPACTION_OWNERSHIP');
 const original=new Map(),allNames=Object.keys(zip.files).filter(n=>!zip.files[n].dir);let before=0;
 for(const n of allNames){await checkpoint();if(!xmlPart(n))continue;const raw=await text(zip,n);original.set(n,{nodes:count(raw)});before+=count(raw);
  if(n.startsWith('word/')&&n.endsWith('.xml')&&!storyPart(n)&&!nonStoryWord.test(n))throw Error('UNSUPPORTED_STORY_PART');
  if(n==='word/theme/theme1.xml'){const theme=parse(raw);if(theme.documentElement.namespaceURI!=='http://schemas.openxmlformats.org/drawingml/2006/main'||theme.documentElement.localName!=='theme'||theme.getElementsByTagNameNS(W,'*').length)throw Error('UNSUPPORTED_THEME_STORY');}
 }
 const names=[...original.keys()].filter(storyPart).sort((a,b)=>a==='word/document.xml'?-1:b==='word/document.xml'?1:a.localeCompare(b));
 if(!names.includes('word/document.xml'))throw Error('MISSING_DOCUMENT');
 const stylesRaw=await text(zip,'word/styles.xml',256*1024),owned=new Set(context.ownedStyleIds);
 if(context.nativeStyleXml)for(const id of readStyleIds(context.nativeStyleXml))owned.add(id);
 const ctx=styleContext(stylesRaw);checkStyleBounds(stylesRaw,parse(stylesRaw));
 if([...ctx.defs.keys()].some(id=>!owned.has(id)))throw Error('COMPACTION_STYLE_OWNERSHIP');
 const styleCounts=new Map();
 for(const n of names){const raw=await text(zip,n);const p=await planStoryAsync(raw,ctx,'tally',checkpoint);for(const[id,total]of p.styleCounts)styleCounts.set(id,(styleCounts.get(id)||0)+total);}
 prepareAdvanced(ctx,styleCounts);const plans=new Map();let sections=[];
 for(const n of names){const raw=await text(zip,n);const p=await planStoryAsync(raw,ctx,'plan',checkpoint);if(n==='word/document.xml')sections=p.sections;plans.set(n,p);}
 // The style budget is an optimizer eligibility bound, not a larger document cap.
 if(ctx.generated.size+ctx.characters.size+ctx.tables.size+ctx.columns.size>512)throw Error('COMPACTION_STYLE_LIMIT');
 const styleDoc=finalStyles(stylesRaw,ctx);if(elementCount(styleDoc)>4096)throw Error('COMPACTION_STYLE_LIMIT');const stylePlan={nodes:elementCount(styleDoc),fingerprint:fingerprint(styleDoc)};
 let post=before-original.get('word/styles.xml').nodes+stylePlan.nodes;for(const[n,p]of plans)post+=p.nodes-original.get(n).nodes;
 const relName='word/_rels/document.xml.rels',relDoc=parse(await text(zip,relName,256*1024)),typesDoc=parse(await text(zip,'[Content_Types].xml',256*1024));
 const rels=kids(relDoc.documentElement),relIds=rels.map(r=>r.getAttribute('Id'));if(new Set(relIds).size!==relIds.length)throw Error('RELATIONSHIP_COLLISION');
 const relMap=new Map(rels.map(r=>[r.getAttribute('Id'),r])),incoming=[];
 for(const n of [...original.keys()].filter(n=>n.endsWith('.rels'))){const d=parse(await text(zip,n,256*1024)),base=n==='_rels/.rels'?'':posix.dirname(posix.dirname(n));for(const r of kids(d.documentElement))if(r.getAttribute('TargetMode')!=='External'){
  const target=posix.normalize(posix.join(base,decodeURIComponent(r.getAttribute('Target').split('#')[0])));if(!allNames.includes(target))throw Error('UNRESOLVED_RELATIONSHIP');incoming.push({part:n,id:r.getAttribute('Id'),target});
 }}
 const removals=new Set(),footerPairs=[],referenceCounts=new Map(plans.get('word/document.xml').referenceCounts);
 // Actual emitted receipts, not authored source-array indices, bind each pair.
 if(context.sections.length===sections.length&&new Set(context.sections.map(s=>s.sectionId)).size===sections.length)for(const s of sections){
  const source=context.sections[s.index],mode=source.footerMode;
  if(!['all','none'].includes(mode)||mode==='all'&&!source.footerOwned||!s.refs.first||!s.refs.default||s.refs.first===s.refs.default)continue;
  const f=relMap.get(s.refs.first),g=relMap.get(s.refs.default);if(!f||!g||f.getAttribute('Type')!==RR+'/footer'||g.getAttribute('Type')!==RR+'/footer')continue;
  const first=posix.normalize('word/'+f.getAttribute('Target')),keep=posix.normalize('word/'+g.getAttribute('Target'));
  if(first===keep||removals.has(first)||removals.has(keep)||!plans.has(first)||!plans.has(keep)||plans.get(first).fingerprint!==plans.get(keep).fingerprint)continue;
  if(mode==='none'&&(!plans.get(first).textEmpty||!plans.get(keep).textEmpty))continue;
  if(incoming.filter(r=>r.target===first).length!==1||referenceCounts.get(s.refs.first)!==1)continue;
  const sidecars=[];let empty=true;
  for(const n of [first,keep]){const side='word/_rels/'+posix.basename(n)+'.rels';if(zip.file(side)){const doc=parse(await text(zip,side,256*1024));if(kids(doc.documentElement).length)empty=false;if(n===first)sidecars.push(side);}}
  if(!empty)continue;const override=kids(typesDoc.documentElement).filter(o=>o.getAttribute('PartName')==='/'+first);if(override.length!==1)continue;
  f.setAttribute('Target',g.getAttribute('Target'));incoming.find(r=>r.part===relName&&r.id===s.refs.first).target=keep;
  removals.add(first);post-=plans.get(first).nodes;for(const side of sidecars){removals.add(side);post-=original.get(side).nodes;}rm(override[0]);post--;footerPairs.push({sectionId:source.sectionId,first,keep});
 }
 if(post>xmlBudget)return {ready:false,before,after:before,reason:'STILL_OVER_BUDGET'};
 await checkpoint();const replacements=new Map();
 const styleXml=serialize(styleDoc,stylesRaw);if(fingerprint(parse(styleXml))!==stylePlan.fingerprint)throw Error('STYLE_ROUNDTRIP_CHANGED');replacements.set('word/styles.xml',styleXml);
 for(const n of names){if(removals.has(n))continue;const raw=await text(zip,n),value=await emitStoryAsync(raw,ctx,plans.get(n),checkpoint);if(count(value)!==plans.get(n).nodes)throw Error('SERIALIZED_COUNT_DRIFT');if(value!==raw)replacements.set(n,value);}
 if(footerPairs.length)for(const[n,doc]of [[relName,relDoc],['[Content_Types].xml',typesDoc]]){const expected=fingerprint(doc),value=serialize(doc,await text(zip,n));if(fingerprint(parse(value))!==expected)throw Error('GRAPH_ROUNDTRIP_CHANGED');replacements.set(n,value);}
 // Recount and validate the staged graph before any private ZIP mutation.
 let actual=0;for(const n of original.keys())if(!removals.has(n))actual+=count(replacements.get(n)??await text(zip,n));
 if(actual!==post||actual>xmlBudget)throw Error('FINAL_PLAN_COUNT_DRIFT');
 for(const edge of incoming)if(!removals.has(edge.part)&&removals.has(edge.target))throw Error('REMOVAL_STILL_REFERENCED');
 return {ready:true,before,after:post,replacements,removals};
}
export function applyPlan(zip,plan){for(const[n,value]of plan.replacements)zip.file(n,value);for(const n of plan.removals)zip.remove(n);}
