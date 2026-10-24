import {test}from'vitest';import assert from'node:assert/strict';
import * as probe from'./font-baseline-probe.mjs';
test('matches nominal Latin advances without changing Thai cluster placement or glyph identity',()=>{
 const text='Aก';const s={ascentPt:10,descentPt:3,glyphs:[{glyphId:1,advancePt:6,offsetXPt:0,offsetYPt:0,clusterStartOffset:0,clusterEndOffset:1},{glyphId:2,advancePt:7,offsetXPt:-1,offsetYPt:2,clusterStartOffset:1,clusterEndOffset:2}],glyphInkBoundsPt:[{left:0,right:5},{left:-1,right:6}],inkLeftPt:0,inkRightPt:12};
 const r=probe.nominalLatin(s,text,{advance:()=>4},11);
 assert.equal(r.glyphs[0].advancePt,4);assert.deepEqual(r.glyphs[1],s.glyphs[1]);assert.equal(r.inkRightPt,10);assert.equal(s.glyphs[0].advancePt,6);
});
test('retains ligature clusters and non-Latin glyphs',()=>{
 const g={glyphId:3,advancePt:8,offsetXPt:0,offsetYPt:0,clusterStartOffset:0,clusterEndOffset:2};
 const r=probe.nominalLatin({ascentPt:10,descentPt:2,glyphs:[g],glyphInkBoundsPt:[{left:0,right:8}]},'fi',{advance:()=>1},11);assert.deepEqual(r.glyphs,[g]);
});
