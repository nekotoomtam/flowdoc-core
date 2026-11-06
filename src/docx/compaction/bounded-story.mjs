// Private lexical framing only, not a replacement for the strict XML
// parser. Every bounded unit must still be parsed in its unchanged root context.
export function splitStory(raw,options={}){
 const {maxUnitBytes=1048576,maxUnitElements=20000,maxUnits=4096,maxDepth=128,maxElements=2000000,maxBytes=32*1048576,allowEmptyRoot=false,allowedRoots=['document','hdr','ftr','footnotes','endnotes']}=options;
 if(typeof raw!=='string'||Buffer.byteLength(raw)>maxBytes||/<!DOCTYPE|<!ENTITY/.test(raw))throw Error('STORY_INELIGIBLE');
 const stack=[],units=[];let at=0,elements=0,containerDepth=0,containerName,contentStart,contentEnd,unitStart,unitElements=0,rootName,rootEnd=0,closedRoot=false;
 const local=s=>s.split(':').at(-1);
 function complete(end){if(units.length>=maxUnits)throw Error('UNIT_COUNT_LIMIT');if(unitElements>maxUnitElements||Buffer.byteLength(raw.slice(unitStart,end))>maxUnitBytes)throw Error('UNIT_LIMIT');units.push({start:unitStart,end,elements:unitElements});unitStart=undefined;}
 function gap(start,end){if(containerDepth&&stack.length===containerDepth&&unitStart===undefined&&raw.slice(start,end).trim())throw Error('STORY_DIRECT_TEXT');}
 while(at<raw.length){
  const start=raw.indexOf('<',at);if(start<0){gap(at,raw.length);if(raw.slice(at).trim()&&!stack.length)throw Error('TRAILING_TEXT');break;}gap(at,start);
  if(raw.startsWith('<!--',start)){const end=raw.indexOf('-->',start+4);if(end<0||raw.slice(start+4,end).includes('--'))throw Error('MALFORMED_COMMENT');at=end+3;continue;}
  if(raw.startsWith('<![CDATA[',start)){const end=raw.indexOf(']]>',start+9);if(end<0||!stack.length||(containerDepth&&stack.length===containerDepth&&unitStart===undefined))throw Error('MALFORMED_CDATA');at=end+3;continue;}
  if(raw.startsWith('<?',start)){const end=raw.indexOf('?>',start+2);if(end<0)throw Error('MALFORMED_PI');at=end+2;continue;}
  if(raw.startsWith('<!',start))throw Error('UNSUPPORTED_DECLARATION');
  let end=start+1,quote;
  for(;end<raw.length;end++){const c=raw[end];if(quote){if(c===quote)quote=undefined;else if(c==='<')throw Error('MALFORMED_ATTRIBUTE');}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;else if(c==='<')throw Error('MALFORMED_MARKUP');}
  if(end>=raw.length||quote)throw Error('UNCLOSED_MARKUP');
  const token=raw.slice(start,end+1),match=/^<(\/?)([A-Za-z_][\w:.-]*)(?=[\s/>])/.exec(token);if(!match)throw Error('UNSUPPORTED_ELEMENT_NAME');
  const [,closing,name]=match,selfClosing=/\/\s*>$/.test(token);
  if(closing){
   if(!new RegExp('^</'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*>$').test(token)||!stack.length||stack.at(-1)!==name)throw Error('MALFORMED_STACK');
   if(stack.length===containerDepth){contentEnd=start;containerDepth=0;}
   stack.pop();
   if(unitStart!==undefined&&stack.length===containerDepth){complete(end+1);}
   if(!stack.length){closedRoot=true;rootEnd=end+1;}
  }else{
   if(closedRoot)throw Error('MULTIPLE_ROOTS');
   if(++elements>maxElements)throw Error('STORY_ELEMENT_LIMIT');
   if(!stack.length){
    rootName=name;const kind=local(name);if(!allowedRoots.includes(kind))throw Error('UNSUPPORTED_ROOT');
    if(selfClosing){if(!allowEmptyRoot||raw.slice(end+1).trim())throw Error('UNSUPPORTED_ROOT');return {units:[],contentStart:end+1,contentEnd:end+1,prefix:raw,suffix:'',elements:1,containerName:name,rootName:name};}
    if(kind!=='document'){containerDepth=1;containerName=name;contentStart=end+1;}
   }else if(stack.length===1&&local(rootName)==='document'&&local(name)==='body'){
    if(contentStart!==undefined||selfClosing)throw Error('UNSUPPORTED_BODY');containerDepth=2;containerName=name;contentStart=end+1;
   }else if(containerDepth&&stack.length===containerDepth){unitStart=start;unitElements=0;}
   else if(stack.length===1&&local(rootName)==='document')throw Error('UNKNOWN_DOCUMENT_CHILD');
   if(unitStart!==undefined)unitElements++;
   if(selfClosing){if(unitStart!==undefined&&stack.length===containerDepth){complete(end+1);}}
   else{stack.push(name);if(stack.length>maxDepth)throw Error('STORY_DEPTH_LIMIT');}
  }
  if(unitStart!==undefined&&(unitElements>maxUnitElements||end+1-unitStart>maxUnitBytes))throw Error('UNIT_LIMIT');
  at=end+1;
 }
 if(stack.length||!closedRoot||contentStart===undefined||contentEnd===undefined||unitStart!==undefined||raw.slice(rootEnd).trim())throw Error('UNCLOSED_STORY');
 return {units,contentStart,contentEnd,prefix:raw.slice(0,contentStart),suffix:raw.slice(contentEnd),elements,containerName,rootName};
}
