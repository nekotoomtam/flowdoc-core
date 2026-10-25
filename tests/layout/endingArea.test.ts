import {it,expect} from 'vitest';
import {endingTemplate,endingDocument} from '../helpers/endingArea.js';
import {composeSizing,sizingEntry} from '../helpers/formatSizing.js';
import {validateTemplate,prepareGeneration,composeDocument} from '../../src/index.js';
import {documentFlow} from '../../src/layout/documentFlow.js';
import {fakeRuntime} from '../helpers/document.js';
import {validateResolvedDocument} from '../../src/composition/validateResolvedDocument.js';
const top=20*72/25.4;
it('carries an explicit final Area boundary and leaves old top flow unchanged',async()=>{
 const t=endingTemplate(),d=composeSizing(t,[sizingEntry('SIGN')]);
 expect(d.sections[0].endingArea).toMatchObject({areaId:'parts',verticalAlign:'bottom',rootStartIndex:1,rootIds:d.sections[0].rootIds.slice(1)});
 const before=JSON.stringify(d),draw=await documentFlow(d,fakeRuntime);expect(JSON.stringify(d)).toBe(before);
 expect(draw.pages).toHaveLength(1);expect(draw.pages[0].commands.map(c=>c.text)).toEqual(['BODY','SIGN']);
 expect(draw.pages[0].commands[1].bounds.yPt).toBeCloseTo(top+80);
 delete t.sections[0].source.fragment.nodes.parts.props.verticalAlign;
 const flow=await documentFlow(composeSizing(t,[sizingEntry('SIGN')]),fakeRuntime);
 expect(flow.pages[0].commands[1].bounds.yPt).toBeCloseTo(top+20);
});
it('moves a fitting final group once when the remainder is insufficient',async()=>{
 const draw=await documentFlow(endingDocument('A\nB\nC\nD','SIGN\nDATE'),fakeRuntime);
 expect(draw.pages).toHaveLength(2);expect(draw.pages[0].commands.map(c=>c.text)).toEqual(['A','B','C','D']);
 expect(draw.pages[1].commands.map(c=>c.text)).toEqual(['SIGN','DATE']);
 expect(draw.pages[1].commands[0].bounds.yPt).toBeCloseTo(top+60);
});
it('allows an oversized final Area to flow without loops and aligns its last fragment',async()=>{
 const text=Array.from({length:12},(_,i)=>'S'+i).join('\n'),d=endingDocument('BODY',text);
 const draw=await documentFlow(d,fakeRuntime,{}, {maxPages:3});
 expect(draw.pages).toHaveLength(3);expect(draw.pages.flatMap(p=>p.commands.map(c=>c.text))).toEqual(['BODY',...Array.from({length:12},(_,i)=>'S'+i)]);
 expect(draw.pages[2].commands.at(-1)!.bounds.yPt).toBeCloseTo(top+80);
});
it('aligns multiple format entries as one Area and does not create space for an absent Area',async()=>{
 const t=endingTemplate(),d=composeSizing(t,[sizingEntry('SIGN'),sizingEntry('DATE')]);
 const draw=await documentFlow(d,fakeRuntime);for(const [i,y]of [top,top+60,top+80].entries())expect(draw.pages[0].commands[i].bounds.yPt).toBeCloseTo(y);
 const empty=await documentFlow(composeSizing(t,[]),fakeRuntime);expect(empty.pages).toHaveLength(1);expect(empty.pages[0].commands.map(c=>c.text)).toEqual(['BODY']);
});
it.each(['nonfinal','nested','invalid','fixed'])('rejects unsupported bottom placement: %s',kind=>{
 const t=endingTemplate(),f=t.sections[0].source.fragment;
 if(kind==='nonfinal')f.rootIds.reverse();
 if(kind==='invalid')f.nodes.parts.props.verticalAlign='middle';
 if(kind==='nested'){f.rootIds=['prefix'];f.nodes.prefix={id:'prefix',type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:100,unit:'pt'}}],rowIds:['row']};f.nodes.row={id:'row',type:'table-row',props:{allowBreak:true},cellIds:['cell']};f.nodes.cell={id:'cell',type:'table-cell',props:{},childIds:['parts']};}
 if(kind==='fixed')t.areaFormats.panel.sizing={mode:'fixed',height:{value:40,unit:'pt'}};
 expect(validateTemplate(t).ok).toBe(false);
});
it('uses the larger continuation capacity before splitting the ending Area',async()=>{
 const d=endingDocument('BODY','A\nB\nC\nD',100);
 d.sections[0].headerMode='first';d.sections[0].header={baseTextStyleId:'body',rootIds:['h'],nodes:{h:{id:'h',type:'text-block',role:{role:'paragraph'},props:{textStyleId:'body'},children:[{id:'hl',type:'text',text:'HEADER\nHEADER'}]}},sourceMap:{}};
 const draw=await documentFlow(d,fakeRuntime);expect(draw.pages).toHaveLength(2);
 expect(draw.pages[0].commands.map(c=>c.text)).toEqual(['HEADER','HEADER','BODY']);
 expect(draw.pages[1].commands.map(c=>c.text)).toEqual(['A','B','C','D']);expect(draw.pages[1].commands[0].bounds.yPt).toBeCloseTo(top+20);
});
it.each(['suffix','owner','fixed','unknown'])('rejects forged resolved ending Area metadata: %s',kind=>{
 const d=endingDocument();if(kind==='suffix')d.sections[0].endingArea.rootStartIndex=0;
 if(kind==='owner')d.sections[0].endingArea.areaId='other';
 if(kind==='fixed')d.formatInstances[0].sizing={mode:'fixed',height:{value:20,unit:'pt'}};
 if(kind==='unknown')d.sections[0].endingArea.extra=true;
 expect(validateResolvedDocument(d).length).toBeGreaterThan(0);
});
it('supports the same final Area option on model18 without changing its request envelope',async()=>{
 const t=endingTemplate();t.nodeModelVersion=18;delete t.areaFormats.panel.sizing;const s=t.sections[0];delete s.nameBase;s.key='main';s.formats={};
 const v=validateTemplate(t);expect(v.ok,JSON.stringify(v)).toBe(true);if(!v.ok)return;
 const q=prepareGeneration(v.value,{docKey:t.docKey,data:{},sections:{main:{data:{parts:[sizingEntry('SIGN')]}}}});expect(q.ok,JSON.stringify(q)).toBe(true);if(!q.ok)return;
 const d=composeDocument(v.value,q.value);expect(d.ok,JSON.stringify(d)).toBe(true);if(!d.ok)return;
 const draw=await documentFlow(d.value,fakeRuntime);expect(draw.pages).toHaveLength(1);expect(draw.pages[0].commands.at(-1)!.bounds.yPt).toBeCloseTo(top+80);
});
it('absorbs table adjacency into bottom-placement space rather than adding a gap after positioning',async()=>{
 const t=endingTemplate(),body=t.sections[0].source.fragment,last=t.areaFormats.panel.fragment;
 const table=(f:any,id:string,text:string)=>{f.nodes[id]={id,type:'table',props:{headerRowCount:0,repeatHeaderRows:false},columns:[{width:{value:200,unit:'pt'}}],rowIds:[id+'r']};f.nodes[id+'r']={id:id+'r',type:'table-row',props:{allowBreak:true},cellIds:[id+'c']};f.nodes[id+'c']={id:id+'c',type:'table-cell',props:{},childIds:[text]};};
 table(body,'body-table','prefix');body.rootIds=['body-table','parts'];table(last,'sign-table','text');last.rootIds=['sign-table'];
 const d=composeSizing(t,[sizingEntry('SIGN')]),draw=await documentFlow(d,{...fakeRuntime,spacingProbe:{tableBoundaryPt:()=>10}});
 expect(draw.pages).toHaveLength(1);expect(draw.pages[0].commands.map(c=>c.text)).toEqual(['BODY','SIGN']);
 expect(Math.max(...draw.pages[0].borders!.map(b=>b.y2Pt))).toBeCloseTo(top+100);
});
