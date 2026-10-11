import {it,expect} from 'vitest';
import {document,fakeRuntime} from '../helpers/document.js';
import {textFlow} from '../../src/layout/textFlow.js';
import {resolveLinkGeometry} from '../../src/layout/linkGeometry.js';

it('renders every tab as one space before breaking and shaping without mutating input',async()=>{
 const source='\tก้\t\t𐐀\r\nA\tB\t';
 const d=document(source),before=JSON.stringify(d);
 const runtime={
  async breaks(text:string){expect(text).not.toContain('\t');return fakeRuntime.breaks(text);},
  async shape(text:string){expect(text).not.toContain('\t');return fakeRuntime.shape(text);}
 };
 const actual=await textFlow(d,runtime);
 const expected=await textFlow(document(source.replace(/\t/g,' ')),fakeRuntime);
 expect(actual).toEqual(expected);expect(JSON.stringify(d)).toBe(before);
});

it('keeps link geometry identical to spaces across CRLF and wrapped lines',async()=>{
 const d:any=document();d.nodeModelVersion=7;
 d.book.page.margin.right={value:210-20-20*25.4/72,unit:'mm'};
 d.nodes.t.children=[{id:'a',type:'text',text:'a\t\r\n'},
  {id:'link',type:'link',text:'b\tcdef',url:'https://example.com'},
  {id:'z',type:'text',text:'\tz'}];
 const before=JSON.stringify(d),spaces=structuredClone(d);
 for(const child of spaces.nodes.t.children)child.text=child.text.replace(/\t/g,' ');
 const actual=await textFlow(d,fakeRuntime),expected=await textFlow(spaces,fakeRuntime);
 resolveLinkGeometry(d,actual);resolveLinkGeometry(spaces,expected);
 const geometry=(draw:typeof actual)=>draw.pages.map(p=>({annotations:p.annotations,commands:p.commands.map(({links,...command})=>({...command,links:links?.map(({link,...span})=>span)}))}));
 expect(geometry(actual)).toEqual(geometry(expected));expect(actual.pages[0]!.annotations?.length).toBeGreaterThan(0);
 expect(JSON.stringify(d)).toBe(before);
});
