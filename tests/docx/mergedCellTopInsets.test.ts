import {deriveMergedCellTopInset} from '../../src/docx/merged-cell-top-insets.js';
import {expect,it} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {groupLabelTemplate,groupLabelRequest} from '../helpers/groupLabels.js';
import {fonts,noImages,staged} from './helpers.js';
const take=<T>(r:api.Result<T>):T=>{if(!r.ok)throw Error(JSON.stringify(r));return r.value;};
function fixture(count=3,top=24,peerTop=8,label='MODULE-LABEL',otherGroups:any[]=[]){
 const t=groupLabelTemplate(),f=t.areaFormats.meeting,n=f.fragment.nodes;
 n.table.props.headerRowCount=0;
 n.memberLabelCell.props.padding={top:{unit:'pt',value:top},bottom:{unit:'pt',value:4},left:{unit:'pt',value:4},right:{unit:'pt',value:4}};
 n.memberCell.props.padding={top:{unit:'pt',value:peerTop},bottom:{unit:'pt',value:8},left:{unit:'pt',value:4},right:{unit:'pt',value:4}};
 const validated=take(api.validateTemplate(t));return take(api.composeDocument(validated,take(api.prepareGeneration(validated,groupLabelRequest(t,[{name:label,members:Array.from({length:count},(_,i)=>({name:`MEMBER-${i}-END`}))},...otherGroups])))));
}
async function exported(d:any,options:api.DocxOptions={}){
 const before=JSON.stringify(d),sink=staged(),e=take(await api.createDocxEngine(fonts()));const receipt=take(await e.generateDocxTo(d,noImages,sink.output,options));expect(JSON.stringify(d)).toBe(before);const zip=await JSZip.loadAsync(Buffer.concat(sink.chunks));return {xml:await zip.file('word/document.xml')!.async('string'),receipt,zip};
}
it('maps authored merged-label top24pt to peer8pt plus paragraph16pt once',async()=>{
 const {xml,receipt}=await exported(fixture());const cells=xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)!;const merged=cells.filter(c=>c.includes('<w:vMerge'));
 expect(merged).toHaveLength(3);for(const c of merged)expect(c).toContain('<w:top w:type="dxa" w:w="160"/>');
 expect(merged[0]).toContain('w:before="320"');for(const c of merged.slice(1))expect(c).not.toContain('w:before="320"');
 expect(xml.split('MODULE-LABEL')).toHaveLength(2);expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',mergedCellTopInsets:expect.arrayContaining([expect.objectContaining({policy:'peer-top-and-single-label-offset',sourceTopTwips:480,physicalTopTwips:160,firstLabelBeforeTwips:320,wordVerified:false})])}));
});
it.each([[3,19.25,6.5],[80,24,8]])('derives peer inset with %i members and top%f/peer%f',async(count,top,peer)=>{
 const {xml}=await exported(fixture(count,top,peer));const merged=(xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[]).filter(c=>c.includes('<w:vMerge'));expect(merged).toHaveLength(count);for(const c of merged)expect(c).toContain(`w:top w:type="dxa" w:w="${peer*20}"`);expect(merged[0]).toContain(`w:before="${(top-peer)*20}"`);
});
it.each([0,1])('leaves %i-member nonmerged group unchanged',async count=>{const {xml}=await exported(fixture(count));expect(xml).not.toContain('<w:vMerge');});

it('keeps a long native label and the offset only once across an80-member group',async()=>{
 const label='LONG-LABEL '+ 'word '.repeat(40),d=fixture(80,24,8,label);const {xml}=await exported(d);const merged=(xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[]).filter(c=>c.includes('<w:vMerge'));
 expect(merged).toHaveLength(80);expect(merged.filter(c=>c.includes('w:before="320"'))).toHaveLength(1);expect(xml.split('LONG-LABEL')).toHaveLength(2);expect(xml).not.toContain('w:type="page"');
});
it('retains a multiline label rather than changing unsupported content flow',async()=>{
 const {xml,receipt}=await exported(fixture(3,24,8,'LINE1\nLINE2'));const merged=(xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[]).filter(c=>c.includes('<w:vMerge'));
 for(const c of merged)expect(c).toContain('w:top w:type="dxa" w:w="480"');expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',mergedCellTopInsets:expect.arrayContaining([expect.objectContaining({policy:'retain-native',reason:'unsupported-label-content'})])}));
});
it('retains mixed peer tops and records the fallback',async()=>{
 const d:any=fixture();const table:any=Object.values(d.nodes).find((n:any)=>n.type==='table');const row=d.nodes[table.rowGroups[0].rowIds[1]];d.nodes[row.cellIds[0]].props.padding.top.value=9;
 const {xml,receipt}=await exported(d);expect(xml).toContain('w:top w:type="dxa" w:w="480"');expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',mergedCellTopInsets:expect.arrayContaining([expect.objectContaining({policy:'retain-native',reason:'mixed-peer-tops'})])}));
});
it('preserves cancellation without output and aborts the staged sink',async()=>{
 const controller=new AbortController();controller.abort();const e=take(await api.createDocxEngine(fonts())),sink=staged();const r=await e.generateDocxTo(fixture(),noImages,sink.output,{signal:controller.signal});expect(r.ok).toBe(false);expect(sink.chunks).toEqual([]);expect(sink.aborts).toHaveLength(1);
});
it.each([
 [{sourceTopTwips:480,nativeTopTwips:480,peerTopTwips:[[160],[160]]},'peer-top-and-single-label-offset'],
 [{sourceTopTwips:160,nativeTopTwips:160,peerTopTwips:[[160],[160]]},'retain-native'],
 [{sourceTopTwips:80,nativeTopTwips:80,peerTopTwips:[[160],[160]]},'retain-native'],
 [{sourceTopTwips:480,nativeTopTwips:480,peerTopTwips:[[160],[180]]},'retain-native'],
 [{sourceTopTwips:480,nativeTopTwips:480,peerTopTwips:[[],[160]]},'retain-native'],
 [{sourceTopTwips:480,nativeTopTwips:475,peerTopTwips:[[160],[160]]},'retain-native'],
 [{sourceTopTwips:480.5,nativeTopTwips:480.5,peerTopTwips:[[160],[160]]},'retain-native'],
 [{sourceTopTwips:480,nativeTopTwips:480,peerTopTwips:[[0],[0]]},'peer-top-and-single-label-offset'],
] as const)('guards pure merged inset decision %#', (input,policy)=>{
 const snapshot=JSON.stringify(input);const r=deriveMergedCellTopInset({cellId:'label',rowIds:['r1','r2'],...input});expect(r.policy).toBe(policy);expect(JSON.stringify(input)).toBe(snapshot);if(policy==='peer-top-and-single-label-offset')expect(r.sourceTopTwips).toBe(r.physicalTopTwips+r.firstLabelBeforeTwips);
});

it('preserves repeated header instructions while mapping the body merged label',async()=>{
 const d:any=fixture();const table:any=Object.values(d.nodes).find((n:any)=>n.type==='table');table.props.headerRowCount=1;table.props.repeatHeaderRows=true;
 const {xml}=await exported(d);expect(xml).toContain('<w:tblHeader/>');const merged=(xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[]).filter(c=>c.includes('<w:vMerge'));for(const c of merged)expect(c).toContain('w:top w:type="dxa" w:w="160"');
});
it('retains custom border geometry instead of applying a legacy inset proof',async()=>{
 const d:any=fixture();const table:any=Object.values(d.nodes).find((n:any)=>n.type==='table');table.props.borderWidth={unit:'pt',value:1};
 const {receipt}=await exported(d);expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',mergedCellTopInsets:expect.arrayContaining([expect.objectContaining({policy:'retain-native',reason:'protected-table-geometry'})])}));
});
it('cancels after actual serialization writes and discards staged bytes',async()=>{
 const controller=new AbortController(),sink=staged(),engine=take(await api.createDocxEngine(fonts()));let writes=0;
 const result=await engine.generateDocxTo(fixture(80),noImages,{async write(b){writes++;await sink.output.write(b);controller.abort();},abort:sink.output.abort},{signal:controller.signal});expect(writes).toBeGreaterThan(0);expect(result.ok).toBe(false);if(!result.ok)expect(result.issues[0]!.code).toBe('DOCX_CANCELLED');expect(sink.chunks).toEqual([]);expect(sink.aborts).toHaveLength(1);
});

it('maps multiple merged labels independently without reusing an offset across groups',async()=>{
 const {xml,receipt}=await exported(fixture(3,24,8,'FIRST-LABEL',[{name:'SECOND-LABEL',members:[{name:'B1'},{name:'B2'}]}]));const merged=(xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g)??[]).filter(c=>c.includes('<w:vMerge'));
 expect(merged).toHaveLength(5);expect(merged.filter(c=>c.includes('w:before="320"'))).toHaveLength(2);expect(xml.split('FIRST-LABEL')).toHaveLength(2);expect(xml.split('SECOND-LABEL')).toHaveLength(2);
 const policy:any=receipt.adaptations.find((r:any)=>r.kind==='table-space-policy');expect(policy.mergedCellTopInsets.filter((d:any)=>d.policy==='peer-top-and-single-label-offset')).toHaveLength(2);
});
it('retains original merged margins for a protected ending Area',async()=>{
 const d:any=fixture(),table:any=Object.values(d.nodes).find((n:any)=>n.type==='table');for(const m of Object.values(d.sourceMap) as any[])Object.assign(m,{areaId:'signing',areaEntryIndex:0,areaFormatId:'sign-format'});
 d.sections[0].endingArea={areaId:'signing',verticalAlign:'bottom',rootStartIndex:0,rootIds:[table.id]};
 const {receipt,zip}=await exported(d);const xml=await zip.file('word/footnotes.xml')!.async('string');expect(xml).toContain('w:top w:type="dxa" w:w="480"');
 expect(receipt.adaptations).toContainEqual(expect.objectContaining({kind:'table-space-policy',mergedCellTopInsets:expect.arrayContaining([expect.objectContaining({policy:'retain-native',reason:'protected-table-geometry'})])}));
});
