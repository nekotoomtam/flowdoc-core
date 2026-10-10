import {it,expect} from 'vitest';
import {assignSystemPageNumbers} from '../../src/layout/systemPageCounting.js';
it('counts physical participating pages independently of resets and visibility',()=>{
 const specs:any[]=[['cover',1,{mode:'exclude',visibility:'hide'}],['body',2,{mode:'continue'}],['blank',1,{mode:'continue'}],['body',2,{mode:'continue',visibility:'hide'}],['body',2,{mode:'exclude'}],['body',2,{mode:'restart',startAt:10}],['body',1,{mode:'continue'}]];
 const sections=specs.map(([role,,numbering],i)=>({sectionId:String(i),role,numbering})),pages=specs.flatMap(([pageRole,count],i)=>Array.from({length:count},(_,j)=>({pageRole,sectionId:String(i),sectionPageIndex:j})));
 assignSystemPageNumbers({nodeModelVersion:16,sections} as any,{pages} as any);
 expect(pages.map((p:any)=>p.pageNumbering.current)).toEqual([null,1,2,3,4,5,null,null,10,11,12]);expect(pages.every((p:any)=>p.pageNumbering.total===8)).toBe(true);
});
it('guards overflow and does not reset for a section with no pages',()=>{const d:any={nodeModelVersion:16,sections:[{sectionId:'empty',numbering:{mode:'restart',startAt:9}},{sectionId:'a',rootIds:[],numbering:{mode:'continue'}}]},draw:any={pages:[{sectionId:'a',pageRole:'body'}]};assignSystemPageNumbers(d,draw);expect(draw.pages[0].pageNumbering.current).toBe(1);d.sections[1].numbering={mode:'restart',startAt:Number.MAX_SAFE_INTEGER};draw.pages.push({sectionId:'a',pageRole:'body'});expect(()=>assignSystemPageNumbers(d,draw)).toThrow(/safe integer/);});

it('handles all excluded, restart default and invalid owners without altering legacy pages',()=>{
 const make=(numbering:any)=>({nodeModelVersion:16,sections:[{sectionId:'a',rootIds:[],numbering}]}) as any;
 const draw:any={pages:[{sectionId:'a',pageRole:'body'},{sectionId:'a',pageRole:'body'}]};assignSystemPageNumbers(make({mode:'exclude'}),draw);expect(draw.pages.map((p:any)=>p.pageNumbering)).toEqual([{current:null,total:0,visibility:'show'},{current:null,total:0,visibility:'show'}]);
 assignSystemPageNumbers(make({mode:'restart'}),draw);expect(draw.pages.map((p:any)=>p.pageNumbering.current)).toEqual([1,2]);
 expect(()=>assignSystemPageNumbers(make(undefined),{pages:[{sectionId:'missing'}]} as any)).toThrow(/Unknown page Section/);
 const legacy:any={pages:[{sectionId:'a',countedPageNumber:42}]};assignSystemPageNumbers({...make(undefined),nodeModelVersion:15},legacy);expect(legacy).toEqual({pages:[{sectionId:'a',countedPageNumber:42}]});
});
