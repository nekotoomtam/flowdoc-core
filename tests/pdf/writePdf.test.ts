import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { writePdf } from '../../src/pdf/writePdf.js';
const font = readFileSync(new URL('../../assets/fonts/Sarabun-Regular.ttf', import.meta.url));
const resource = {fontId:'font-regular',subsetBytes:font,subsetPrefix:'FDTEST',postScriptName:'FlowDocTest'};
const run = {id:'run',nodeId:'text',kind:'glyph-run' as const,text:'ก',fontId:'font-regular',fontSizePt:14,lineHeightPt:24,baselineOffsetPt:18,color:'000000',bounds:{xPt:40,yPt:40,widthPt:100,heightPt:24},glyphs:[{glyphId:1,advancePt:8,offsetXPt:0,offsetYPt:0,clusterStartOffset:0,clusterEndOffset:1}]};
const draw = {pages:[{widthPt:595.28,heightPt:841.89,backgroundColor:'FFFFFF',commands:[run]}]};
describe('private PDF writer',()=>{
  it('writes PDF objects, Unicode and valid byte xref offsets',()=>{
    const bytes=Buffer.from(writePdf(draw,[resource])); const text=bytes.toString('latin1');
    expect(text.startsWith('%PDF-1.7')).toBe(true);expect(text).toContain('/ToUnicode');expect(text).toContain('FEFF0E01');
    const offset=Number(/startxref\n(\d+)/.exec(text)![1]);expect(bytes.subarray(offset,offset+4).toString()).toBe('xref');
  });
  it('requires a resource for every font',()=>{expect(()=>writePdf(draw,[])).toThrow(/font/i);});
  it('writes mixed fonts and vertical glyph positioning',()=>{
    const second={...run,id:'second',fontId:'font-bold',glyphs:[run.glyphs[0]!,{...run.glyphs[0]!,offsetYPt:2,advancePt:0}]};
    const bytes=writePdf({pages:[{...draw.pages[0]!,commands:[run,second]}]},[resource,{...resource,fontId:'font-bold'}]);
    expect(Buffer.from(bytes).toString('latin1')).toContain('/F2');
    expect(Buffer.from(bytes).toString('latin1')).toContain('1 0 0 1 48 785.89 Tm');
  });
  it('rejects a glyph absent from the embedded subset',()=>{
    expect(()=>writePdf({pages:[{...draw.pages[0]!,commands:[{...run,glyphs:[{...run.glyphs[0]!,glyphId:65535}]}]}]},[resource])).toThrow(/glyph/i);
  });
});
