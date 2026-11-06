import {it as test} from 'vitest';import assert from 'node:assert/strict';import {splitStory} from '../../src/docx/compaction/bounded-story.mjs';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const wrap=s=>'<?xml version="1.0"?><w:document xmlns:w="'+W+'"><w:body>'+s+'</w:body></w:document>';
test('preserves byte spans and never divides a nested table',()=>{const raw=wrap('<w:p><w:r><w:t xml:space="preserve"> ไทย 😀 &lt;w:p&gt; </w:t></w:r></w:p><!--keep--><w:tbl><w:tr><w:tc><w:p><w:r><w:t><![CDATA[x < y]]></w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/>');const s=splitStory(raw);assert.equal(s.units.length,3);assert.deepEqual(s.units.map(u=>u.elements),[3,6,1]);let rebuilt=s.prefix,at=s.contentStart;for(const u of s.units){rebuilt+=raw.slice(at,u.start)+raw.slice(u.start,u.end);at=u.end;}rebuilt+=raw.slice(at,s.contentEnd)+s.suffix;assert.equal(rebuilt,raw);});
test('quotes, PI, comments and namespace aliases do not create fake element boundaries',()=>{const raw='<x:hdr xmlns:x="'+W+'" xmlns:a="urn:a"><?z a?><x:p a:attr="a > b"><x:r><x:t>ok</x:t></x:r></x:p><!-- <x:p/> --><x:p/></x:hdr>';const s=splitStory(raw);assert.equal(s.units.length,2);assert.equal(s.units[0].elements,3);assert.match(s.prefix,/xmlns:a/);});
test('rejects forbidden DTD, malformed stack, unclosed markup, unknown root, and direct text',()=>{for(const raw of ['<!DOCTYPE x>'+wrap(''),wrap('<w:p></w:r>'),wrap('<w:p a="unterminated>'),'<bad/>',wrap('text<w:p/>'),wrap('<!-- bad -- comment -->')])assert.throws(()=>splitStory(raw));});
test('oversized unit fails before any parser allocation',()=>{assert.throws(()=>splitStory(wrap('<w:p>'+('<w:r/>' .repeat(4))+'</w:p>'),{maxUnitElements:4}),/UNIT_LIMIT/);assert.throws(()=>splitStory(wrap('<w:p a="long"/>'),{maxUnitBytes:10}),/UNIT_LIMIT/);});
test('empty stories and whitespace/comments remain exact',()=>{const raw=wrap(' \n<!-- keep -->');const s=splitStory(raw);assert.equal(s.units.length,0);assert.equal(s.prefix+raw.slice(s.contentStart,s.contentEnd)+s.suffix,raw);});

import {styleContext,planAndTransform,serialize,elementCount,parse,addStyles} from '../../src/docx/compaction/planner.mjs';
import {prepareAdvanced,advanced,finalStyles,fingerprint} from '../../src/docx/compaction/advanced.mjs';
import {planStory,emitStory} from '../../src/docx/compaction/bounded-transform.mjs';
const styles='<w:styles xmlns:w="'+W+'"><w:style w:type="paragraph" w:styleId="Normal" w:default="1"/><w:style w:type="table" w:styleId="TableNormal"/></w:styles>';
const paragraph='<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b w:val="true"/><w:cs/></w:rPr><w:t xml:space="preserve"> ไทย 😀 &#x85; &#x2028; </w:t></w:r></w:p>';
test('bounded plan/replay equals whole DOM on text, tables, defaults and generated styles',()=>{
 const raw=wrap(paragraph+'<!-- protected -->'+'<w:tbl><w:tblPr><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="200"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:type="dxa" w:w="200"/></w:tcPr>'+paragraph+'</w:tc></w:tr></w:tbl>');
 const whole=styleContext(styles),first=planAndTransform(raw,whole),counts=new Map();
 for(const p of Array.from(first.doc.getElementsByTagNameNS(W,'p'))){const id=p.getElementsByTagNameNS(W,'pStyle')[0]?.getAttributeNS(W,'val')??'';counts.set(id,(counts.get(id)??0)+1);}
 prepareAdvanced(whole,counts);const p=planAndTransform(raw,whole);advanced(p.doc,whole);
 const bounded=styleContext(styles),tally=planStory(raw,bounded,{phase:'tally'});prepareAdvanced(bounded,new Map(tally.styleCounts));const plan=planStory(raw,bounded),output=emitStory(raw,bounded,plan);
 assert.equal(fingerprint(parse(output)),fingerprint(p.doc));assert.equal(elementCount(parse(output)),plan.nodes);assert.equal(fingerprint(finalStyles(styles,bounded)),fingerprint(finalStyles(styles,whole)));assert.match(output,/protected/);assert.match(output,/ไทย 😀/);
});
test('plan drift, namespace mismatch and lossy numeric CR refuse publication',()=>{
 const raw=wrap(paragraph),ctx=styleContext(styles),tally=planStory(raw,ctx,{phase:'tally'});prepareAdvanced(ctx,new Map(tally.styleCounts));const plan=planStory(raw,ctx);
 assert.throws(()=>emitStory(raw.replace('ไทย','other'),ctx,plan),/PLAN_DRIFT/);
 assert.throws(()=>planStory('<w:hdr xmlns:w="urn:wrong"><w:p/></w:hdr>',ctx),/ROOT_NAMESPACE/);
 const cr=wrap(paragraph.replace('ไทย','&#13;ไทย'));assert.throws(()=>planStory(cr,ctx),/CR_TEXT/);
});

import {parseGeneratedXml} from '../../src/docx/compaction/xml.mjs';
test('strict namespace/doctype/depth rules preserve XML1.0 Unicode or refuse before replay',()=>{
 const xml='<w:hdr xmlns:w="'+W+'"><w:p><w:r><w:t>ไทย 😀\u0085\u2028\u2029</w:t></w:r></w:p></w:hdr>';
 assert.equal(parseGeneratedXml(xml).documentElement.textContent,'ไทย 😀\u0085\u2028\u2029');
 for(const invalid of ['<!DOCTYPE x>'+xml,xml.replace('xmlns:w="'+W+'"','xmlns:w="'+W+'" xmlns:a="urn:a" xmlns:b="urn:a" a:x="1" b:x="2"'),xml.replace('<w:p>','<missing:p>').replace('</w:p>','</missing:p>'),'<?xml version="1.1"?>'+xml])assert.throws(()=>parseGeneratedXml(invalid),undefined,invalid);
 assert.throws(()=>parseGeneratedXml('<w:hdr xmlns:w="'+W+'">'+'<w:p>'.repeat(130)+'</w:p>'.repeat(130)+'</w:hdr>'),/DEPTH/);
});

test('bounds total story units before repeated DOM work',()=>{assert.throws(()=>splitStory(wrap('<w:p/>'.repeat(3)),{maxUnits:2}),/UNIT_COUNT/);});

test('keeps heading emphasis explicit for Word field regeneration instead of lifting it into a paragraph style',()=>{
 for(const level of [0,2,8])for(const direct of [true,false]){
  const inherited=styles.replace('</w:styles>','<w:style w:type="paragraph" w:styleId="HeadingBase"><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="'+level+'"/></w:pPr>'+(!direct?'<w:rPr><w:b/><w:bCs/></w:rPr>':'')+'</w:style><w:style w:type="paragraph" w:styleId="Heading"><w:basedOn w:val="HeadingBase"/></w:style></w:styles>');
  for(const useStyle of [true,false]){
   if(!direct&&!useStyle)continue;
   const ctx=styleContext(inherited),raw=wrap('<w:p><w:pPr>'+(useStyle?'<w:pStyle w:val="Heading"/>':'<w:outlineLvl w:val="'+level+'"/>')+'<w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b w:val="'+direct+'"/><w:bCs w:val="'+direct+'"/></w:rPr><w:t>Heading</w:t></w:r></w:p>');
   const result=planAndTransform(raw,ctx),run=result.doc.getElementsByTagNameNS(W,'r')[0];
   if(direct){assert.equal(run.getElementsByTagNameNS(W,'rStyle')[0]?.getAttributeNS(W,'val'),ctx.characters.get('heading-bold')?.id);assert.equal(ctx.characters.size,1);}
   else{assert.equal(run.getElementsByTagNameNS(W,'b')[0]?.getAttributeNS(W,'val'),'false');assert.equal(run.getElementsByTagNameNS(W,'bCs')[0]?.getAttributeNS(W,'val'),'false');}
   for(const generated of ctx.generated.values())for(const key of ['b','bCs','i','iCs'])assert.equal(generated.selected[key],undefined);
  }
 }
 const body=styleContext(styles);const result=planAndTransform(wrap(paragraph),body);
 assert.equal(result.doc.getElementsByTagNameNS(W,'r')[0].getElementsByTagNameNS(W,'b').length,0,'ordinary body text keeps existing run compaction; paragraph-mark compensation remains');
});

test('does not retain heading false emphasis when the unchanged source style already supplies false',()=>{
 const ctx=styleContext(styles),result=planAndTransform(wrap('<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:rPr><w:b w:val="false"/><w:i w:val="false"/></w:rPr><w:t>Normal heading</w:t></w:r></w:p>'),ctx);
 assert.equal(result.doc.getElementsByTagNameNS(W,'b').length,0);assert.equal(result.doc.getElementsByTagNameNS(W,'i').length,0);
});

test('shares explicit heading bold through one character style while retaining its source paragraph emphasis environment',()=>{
 const heading='<w:p><w:pPr><w:outlineLvl w:val="1"/><w:rPr><w:b/><w:bCs/></w:rPr></w:pPr><w:r><w:rPr><w:b/><w:bCs/><w:cs/></w:rPr><w:t>Heading</w:t></w:r></w:p>',ctx=styleContext(styles),result=planAndTransform(wrap(heading.repeat(4)),ctx);
 assert.equal(ctx.characters?.size,1);const id=[...ctx.characters.values()][0].id;
 for(const rp of Array.from(result.doc.getElementsByTagNameNS(W,'rPr'))){assert.equal(rp.getElementsByTagNameNS(W,'rStyle')[0]?.getAttributeNS(W,'val'),id);assert.equal(rp.getElementsByTagNameNS(W,'b').length,0);}
 assert.equal(result.doc.getElementsByTagNameNS(W,'cs').length,4);
 const styleDoc=addStyles(styles,ctx),character=Array.from(styleDoc.getElementsByTagNameNS(W,'style')).find(s=>s.getAttributeNS(W,'styleId')===id)!;
 assert.equal(character.getAttributeNS(W,'type'),'character');assert.equal(character.getElementsByTagNameNS(W,'b').length,1);assert.equal(character.getElementsByTagNameNS(W,'bCs').length,1);
 for(const s of ctx.generated.values()){assert.equal(s.selected.b,undefined);assert.equal(s.selected.bCs,undefined);}
});

test('does not replace an existing heading character style and refuses a generated character ID collision',()=>{
 const existing=styles.replace('</w:styles>','<w:style w:type="character" w:styleId="Existing"><w:rPr><w:i/></w:rPr></w:style></w:styles>'),raw=wrap('<w:p><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:r><w:rPr><w:rStyle w:val="Existing"/><w:b/><w:bCs/></w:rPr><w:t>Heading</w:t></w:r></w:p>'),ctx=styleContext(existing),result=planAndTransform(raw,ctx);
 assert.equal(result.doc.getElementsByTagNameNS(W,'rStyle')[0].getAttributeNS(W,'val'),'Existing');assert.equal(ctx.characters.size,0);
 const shared=raw.replace('<w:rStyle w:val="Existing"/>',''),fresh=styleContext(styles);planAndTransform(shared,fresh);const id=fresh.characters.get('heading-bold')!.id;
 const collision=styles.replace('</w:styles>','<w:style w:type="character" w:styleId="'+id+'"/></w:styles>');assert.throws(()=>planAndTransform(shared,styleContext(collision)),/CHARACTER_STYLE_COLLISION/);
});

test('removes only empty inline-picture fill defaults and inactive zero offsets',()=>{
 const A='http://schemas.openxmlformats.org/drawingml/2006/main',WP='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',PIC='http://schemas.openxmlformats.org/drawingml/2006/picture';
 const picture=(rect='<a:fillRect/>',off='<a:off x="0" y="0"/>',attrs='')=>'<wp:inline><a:graphic><a:graphicData uri="'+PIC+'"><pic:pic><pic:blipFill><a:blip/><a:stretch>'+rect+'</a:stretch></pic:blipFill><pic:spPr><a:xfrm '+attrs+'>'+off+'<a:ext cx="100" cy="100"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline>';
 const run=(xml:string)=>{const doc=parse('<w:document xmlns:w="'+W+'" xmlns:a="'+A+'" xmlns:wp="'+WP+'" xmlns:pic="'+PIC+'"><w:body>'+xml+'</w:body></w:document>'),ctx=styleContext(styles);Object.assign(ctx,{tables:new Map(),columns:new Map(),centerIds:new Set(),promoted:'Normal',pprops:()=>({})});advanced(doc,ctx);return doc;};
 const safe=run(picture());assert.equal(safe.getElementsByTagNameNS(A,'fillRect').length,0);assert.equal(safe.getElementsByTagNameNS(A,'off').length,0);
 for(const rect of ['<a:fillRect l="1"/>','<a:fillRect><!--preserve--></a:fillRect>'])assert.equal(run(picture(rect)).getElementsByTagNameNS(A,'fillRect').length,1);
 for(const [off,attrs]of [['<a:off x="1" y="0"/>',''],['<a:off x="0" y="0"/>','rot="1"'],['<a:off x="0" y="0"/>','flipH="true"'],['<a:off x="0" y="0"><!--keep--></a:off>','']])assert.equal(run(picture('<a:fillRect/>',off,attrs)).getElementsByTagNameNS(A,'off').length,1);
 assert.equal(run(picture().replaceAll('wp:inline','wp:anchor')).getElementsByTagNameNS(A,'off').length,1);
 assert.equal(run(picture().replace('uri="'+PIC+'"','uri="urn:unknown"')).getElementsByTagNameNS(A,'fillRect').length,1);
});
