import {it,expect} from 'vitest';
import {decodeShape,byteOffsets} from '../../src/runtime/textRuntime.js';
const glyph={glyphId:1,cluster:0,xAdvance:500,yAdvance:0,xOffset:0,yOffset:0,ink:{xMin:0,xMax:500,yMin:-100,yMax:800}};
const raw={unitsPerEm:1000,ascent:900,descent:-200,shaperRevision:'rustybuzz-0.20.1',glyphs:[glyph]};
it('converts UTF-8 cluster boundaries to UTF-16 including non-BMP',()=>{const text='𐐀ก';const shape=decodeShape({...raw,glyphs:[glyph,{...glyph,cluster:4}]},text,10);expect(shape.glyphs.map(g=>[g.clusterStartOffset,g.clusterEndOffset])).toEqual([[0,2],[2,3]]);expect(shape.ascentPt).toBe(9);});
it.each([1,2,3])('rejects cluster inside a scalar at byte %s',cluster=>{expect(()=>decodeShape({...raw,glyphs:[{...glyph,cluster}]},'𐐀',10)).toThrow();});
it('rejects missing glyphs, nonfinite metrics and unsupported vertical advances',()=>{for(const change of [{glyphId:0},{xAdvance:NaN},{yAdvance:1}])expect(()=>decodeShape({...raw,glyphs:[{...glyph,...change}]},'ก',10)).toThrow();});
it('maps end and rejects ill-formed text',()=>{expect(byteOffsets('ก𐐀').get(7)).toBe(3);expect(()=>byteOffsets('\ud800')).toThrow();});
