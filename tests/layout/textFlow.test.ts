import { describe,it,expect } from 'vitest';
import { textFlow } from '../../src/layout/textFlow.js';
import { validateResolvedDocument } from '../../src/composition/validateResolvedDocument.js';
import type { ResolvedDocument } from '../../src/composition/resolvedDocument.js';
import {document,fakeRuntime} from '../helpers/document.js';
describe('resolved input',()=>{
 it.each([['body'],{toString:null,valueOf:null},null].map(value=>({value})))('rejects non-string style reference without coercion: $value',({value})=>{
  const d:any=document();d.nodes.t.props.textStyleId=value;
  expect(()=>validateResolvedDocument(d)).not.toThrow();expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
 });
 it('accepts the text graph and rejects table nodes explicitly',()=>{expect(validateResolvedDocument(document())).toEqual([]);const d:any=document();d.nodes.t.type='table';expect(validateResolvedDocument(d)[0]?.code).toBe('LAYOUT_FAILED');});
 it.each(['orphan','unknownStyle','duplicateInline','nan','margin','unknownProp','fieldRef'])('rejects %s',kind=>{
  const d:any=document();if(kind==='orphan')d.nodes.orphan={...d.nodes.t,id:'orphan'};
  if(kind==='unknownStyle')d.nodes.t.props.textStyleId='missing';if(kind==='duplicateInline')d.nodes.t.children.push({...d.nodes.t.children[0]});
  if(kind==='nan')d.styles.body.fontSize.value=NaN;if(kind==='margin')d.book.page.margin.left.value=400;
  if(kind==='unknownProp')d.nodes.t.props.width=100;if(kind==='fieldRef')d.nodes.t.children[0].type='field-ref';
  expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
 });
});
describe('text flow',()=>{
 it('combines adjacent leaves before shaping; preserves Thai and non-BMP text',async()=>{
  const d=document('ก');d.nodes.t!.children.push({id:'mark',type:'text',text:'้𐐀'});
  const flow=await textFlow(d,fakeRuntime);expect(flow.pages.flatMap(p=>p.commands).map(r=>r.text).join('')).toBe('ก้𐐀');
 });
 it('preserves explicit blank lines and empty blocks',async()=>{
  const d=document('a\n\nb');const flow=await textFlow(d,fakeRuntime);expect(flow.pages[0]!.commands.map(r=>r.bounds.yPt)).toEqual([20*72/25.4,20*72/25.4+36]);
  const empty=document('');empty.nodes.t!.children=[];expect((await textFlow(empty,fakeRuntime)).pages).toHaveLength(1);
 });
 it('moves the whole overflow line to a new page without omissions',async()=>{
  const text=Array.from({length:60},(_,i)=>`line${i}`).join('\n');const flow=await textFlow(document(text),fakeRuntime);
  expect(flow.pages.length).toBe(2);expect(flow.pages.flatMap(p=>p.commands).map(r=>r.text).join('\n')).toBe(text);
  for(const p of flow.pages)for(const r of p.commands)expect(r.bounds.yPt+r.bounds.heightPt).toBeLessThanOrEqual(p.heightPt-20*72/25.4+1e-6);
 });
 it('uses exact fit and whole grapheme fallback for long words',async()=>{
  const d=document('abcdefgh');d.book.page.margin.right={value:210-20-20*25.4/72,unit:'mm'};
  const flow=await textFlow(d,fakeRuntime);expect(flow.pages[0]!.commands.map(r=>r.text)).toEqual(['abcd','efgh']);
 });
 it('fails if a whole grapheme or the line height cannot fit',async()=>{
  const d=document('ก้');d.book.page.margin.right={value:210-20-5*25.4/72,unit:'mm'};
  await expect(textFlow(d,fakeRuntime)).rejects.toThrow();
  const tall=document();tall.styles.body!.lineHeightPt=1000;await expect(textFlow(tall,fakeRuntime)).rejects.toThrow();
 });
});
