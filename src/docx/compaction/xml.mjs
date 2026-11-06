import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
import {splitStory} from './bounded-story.mjs';
const XML='http://www.w3.org/XML/1998/namespace',NS='http://www.w3.org/2000/xmlns/',MC='http://schemas.openxmlformats.org/markup-compatibility/2006';
const roots=['document','hdr','ftr','footnotes','endnotes','styles','Relationships','Types','numbering','settings','fonts','webSettings','theme'];
// Validate expanded attribute names on the lexical input, before a DOM's
// NamedNodeMap can coalesce aliases bound to the same namespace.
function lexicalNamespaces(raw){
 const base=Object.create(null);base.xml=XML;base.xmlns=NS;const scopes=[base];let at=0;
 while((at=raw.indexOf('<',at))>=0){
  if(raw.startsWith('<!--',at)){at=raw.indexOf('-->',at+4)+3;continue;}
  if(raw.startsWith('<![CDATA[',at)){at=raw.indexOf(']]>',at+9)+3;continue;}
  if(raw.startsWith('<?',at)){at=raw.indexOf('?>',at+2)+2;continue;}
  let end=at+1,quote;for(;end<raw.length;end++){const c=raw[end];if(quote){if(c===quote)quote=undefined;}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
  const token=raw.slice(at,end+1);if(token.startsWith('</')){scopes.pop();at=end+1;continue;}
  const match=/^<([A-Za-z_][\w:.-]*)/.exec(token);if(!match)throw Error('XML_NAME');
  const tail=token.slice(match[0].length,-1),attrs=[],rule=/\s+([A-Za-z_][\w:.-]*)\s*=\s*(['"])([\s\S]*?)\2/y;let cursor=0;
  while(cursor<tail.length){if(/^\s*\/?\s*$/.test(tail.slice(cursor)))break;rule.lastIndex=cursor;const m=rule.exec(tail);if(!m)throw Error('XML_ATTRIBUTE_SYNTAX');attrs.push([m[1],m[3]]);if(attrs.length>256)throw Error('XML_ATTRIBUTE_LIMIT');cursor=rule.lastIndex;}
  const scope=Object.create(scopes.at(-1)),seen=new Set();
  for(const[name,value]of attrs)if(name==='xmlns'||name.startsWith('xmlns:')){if(value.includes('&'))throw Error('XML_NAMESPACE_ENCODING');const prefix=name==='xmlns'?'':name.slice(6);Object.defineProperty(scope,prefix,{value,enumerable:true,configurable:true});}
  for(const[name]of attrs){const parts=name.split(':');if(parts.length>2)throw Error('XML_ATTRIBUTE_NAME');const uri=parts.length===1?(name==='xmlns'?NS:''):scope[parts[0]];if(parts.length===2&&!uri)throw Error('XML_NAMESPACE');const key=uri+'\0'+parts.at(-1);if(seen.has(key))throw Error('XML_DUPLICATE_ATTRIBUTE');seen.add(key);}
  if(!/\/\s*>$/.test(token))scopes.push(scope);at=end+1;
 }
}
export function parseGeneratedXml(raw){
 if(typeof raw!=='string'||/<!DOCTYPE|<!ENTITY/.test(raw))throw Error('UNSUPPORTED_DTD');
 splitStory(raw,{allowedRoots:roots,allowEmptyRoot:true,maxBytes:2*1048576,maxUnitBytes:2*1048576,maxUnitElements:40000,maxElements:40000});
 let input=raw.replace(/^\uFEFF/,'');
 if(/^<\?xml\s/.test(input)){
  const end=input.indexOf('?>');if(end<0)throw Error('XML_DECLARATION');const declaration=input.slice(0,end+2);
  if(!/^<\?xml\s+version=(['"])1\.0\1(?:\s+encoding=(['"])[Uu][Tt][Ff]-8\2)?(?:\s+standalone=(['"])(?:yes|no)\3)?\s*\?>$/.test(declaration))throw Error('XML_DECLARATION');input=input.slice(end+2);
 }
 lexicalNamespaces(input);
 const doc=new DOMParser({locator:false,onError(level,message){throw Error('XML_'+level+': '+message);},normalizeLineEndings:s=>s.replace(/\r\n?/g,'\n')}).parseFromString(input,'application/xml');
 const initial=Object.create(null);initial.xml=XML;initial.xmlns=NS;
 function walk(n,parent){
  if(n.nodeType===1){
   const scope=Object.create(parent),attributes=Array.from(n.attributes),names=new Set();
   for(const a of attributes)if(a.namespaceURI===NS){const prefix=a.name==='xmlns'?'':a.localName;if(prefix==='xmlns'||prefix==='xml'&&a.value!==XML||prefix!=='xml'&&a.value===XML||a.value===NS)throw Error('XML_NAMESPACE');Object.defineProperty(scope,prefix,{value:a.value,enumerable:true});}
   const bound=(prefix,uri,attribute=false)=>{if(prefix){if(!uri||scope[prefix]!==uri)throw Error('XML_NAMESPACE');}else if(!attribute&&(scope['']||null)!==(uri||null))throw Error('XML_NAMESPACE');else if(attribute&&uri)throw Error('XML_NAMESPACE');};
   bound(n.prefix,n.namespaceURI);
   for(const a of attributes){const key=(a.namespaceURI??'')+'\0'+a.localName;if(names.has(key))throw Error('XML_DUPLICATE_ATTRIBUTE');names.add(key);if(a.namespaceURI!==NS)bound(a.prefix,a.namespaceURI,true);
    if(a.namespaceURI===MC&&['Ignorable','Requires'].includes(a.localName)||n.namespaceURI===MC&&n.localName==='Choice'&&a.localName==='Requires')for(const prefix of a.value.trim().split(/\s+/).filter(Boolean))if(!scope[prefix])throw Error('XML_QNAME_BINDING');
   }
   for(let c=n.firstChild;c;c=c.nextSibling)walk(c,scope);
  }else if(n.nodeType===9){for(let c=n.firstChild;c;c=c.nextSibling)walk(c,parent);}
  else if([3,4].includes(n.nodeType)){if(n.data.includes('\r'))throw Error('UNSUPPORTED_CR_TEXT');}
  else if(n.nodeType===7){if(n.target.toLowerCase()==='xml')throw Error('XML_RESERVED_PI');}
  else if(n.nodeType!==8)throw Error('XML_NODE_KIND');
 }
 walk(doc,initial);return doc;
}
export function serializeGeneratedXml(doc,original=undefined){
 let prolog='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 if(original!==undefined){const bom=original.startsWith('\uFEFF')?'\uFEFF':'',body=original.slice(bom.length),declaration=/^<\?xml\s[^?]*\?>/.exec(body)?.[0]??'';prolog=bom+declaration;}
 return prolog+new XMLSerializer().serializeToString(doc,{requireWellFormed:true});
}
