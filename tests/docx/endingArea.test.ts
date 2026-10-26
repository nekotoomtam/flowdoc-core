import {it,expect} from 'vitest';
import JSZip from 'jszip';
import * as api from '../../src/index.js';
import {endingDocument} from '../helpers/endingArea.js';
import {endingTemplate} from '../helpers/endingArea.js';
import {composeSizing,sizingEntry} from '../helpers/formatSizing.js';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {fonts,noImages,staged} from './helpers.js';
it('rejects B ending-Area cells with unequal native row margins instead of under-drawing the row',async()=>{
 const t=endingTemplate(),f=t.areaFormats.panel.fragment,pt=(value:number)=>({value,unit:'pt'});
 f.nodes.text.children=[{id:'literal',type:'text',text:'X'}];f.nodes.other={...f.nodes.text,id:'other',children:[{id:'otherliteral',type:'text',text:'Y'}]};
 f.nodes.table={id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false,borderStyle:'thickThinWideGap',borderWidth:pt(.35)},columns:[{width:pt(100)},{width:pt(100)}],rowIds:['row']};
 f.nodes.row={id:'row',type:'table-row',props:{allowBreak:true},cellIds:['one','two']};
 f.nodes.one={id:'one',type:'table-cell',props:{padding:{top:pt(20),bottom:pt(0),left:pt(4),right:pt(4)}},childIds:['text']};f.nodes.two={id:'two',type:'table-cell',props:{padding:{top:pt(0),bottom:pt(20),left:pt(4),right:pt(4)}},childIds:['other']};f.rootIds=['table'];
 const d=composeSizing(t,[sizingEntry('SIGN')]),engine=await api.createDocxEngine(fonts());if(!engine.ok)throw Error(JSON.stringify(engine));const sink=staged(),r=await engine.value.generateDocxTo(d,noImages,sink.output,{textLayout:'native'});
 expect(r.ok).toBe(false);if(!r.ok)expect(r.issues[0]).toMatchObject({code:'DOCX_CAPABILITY_UNSUPPORTED',message:expect.stringContaining('uniform emitted')});expect(sink.chunks).toHaveLength(0);
});
it('keeps the final Area once in editable native page-bottom content without a visible note marker',async()=>{
 const d=endingDocument(),before=JSON.stringify(d),e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));
 const sink=staged(),r=await e.value.generateDocxTo(d,noImages,sink.output,{textLayout:'native'});expect(r.ok,JSON.stringify(r)).toBe(true);if(!r.ok)return;
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),body=await z.file('word/document.xml')!.async('string'),notes=await z.file('word/footnotes.xml')!.async('string');
 expect(body).toContain('>BODY</w:t>');expect(body).not.toContain('>SIGN</w:t>');expect(notes.match(/>SIGN<\/w:t>/g)).toHaveLength(1);
 expect(body).toContain('w:customMarkFollows="1"');expect(notes).not.toContain('<w:footnoteRef');expect(notes).not.toContain('<w:separator');expect(notes).not.toContain('<w:continuationSeparator');
 expect(body).not.toContain('w:txbxContent');expect((body.match(/<w:sectPr/g)??[])).toHaveLength(1);expect(JSON.stringify(d)).toBe(before);
 expect(r.value.adaptations).toContainEqual(expect.objectContaining({kind:'ending-area',storage:'native-page-bottom-note',wordVerified:false}));
});
it('retains one authored page break before the final Area anchor',async()=>{
 const t=endingTemplate(),f=t.sections[0].source.fragment;f.rootIds.splice(1,0,'br');f.nodes.br={id:'br',type:'page-break'};
 const d=composeSizing(t,[sizingEntry('SIGN')]),e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const sink=staged(),r=await e.value.generateDocxTo(d,noImages,sink.output);expect(r.ok,JSON.stringify(r)).toBe(true);
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await z.file('word/document.xml')!.async('string');expect(xml.match(/<w:br w:type="page"\/>/g)).toHaveLength(1);
 expect(xml.indexOf('<w:br w:type="page"')).toBeLessThan(xml.indexOf('<w:footnoteReference'));
});
it('preserves a table, image and hyperlink in the ending Area note with resolved relationships',async()=>{
 const t=endingTemplate(),f=t.areaFormats.panel.fragment,id='22222222-2222-4222-8222-222222222222';
 t.areaFormats.panel.inputSchema.fields.photo={type:'image',required:true};
 f.nodes.text.children.push({id:'external',type:'url',value:'https://example.com'});
 f.nodes.picture={id:'picture',type:'image',props:{source:{scope:'local',key:'photo'},width:{value:10,unit:'pt'},height:{value:10,unit:'pt'}}};
 f.nodes.table={id:'table',type:'table',props:{headerRowCount:0,repeatHeaderRows:false,borderStyle:'none'},columns:[{width:{value:200,unit:'pt'}}],rowIds:['row']};
 f.nodes.row={id:'row',type:'table-row',props:{allowBreak:true},cellIds:['cell']};f.nodes.cell={id:'cell',type:'table-cell',props:{},childIds:['text','picture']};f.rootIds=['table'];
 const d=composeSizing(t,[{format:'panel',data:{text:'SIGN',photo:id}}]),e=await api.createDocxEngine(fonts());if(!e.ok)throw Error(JSON.stringify(e));const sink=staged(),bytes=deflateSync(Buffer.from([0,0,0])),ref={key:'rgb',byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const provider:api.PdfImageProvider={contract:api.PDF_STREAM_CONTRACT,images:{[id]:{kind:'rgb-deflate',width:1,height:1,content:ref}},async*open(){yield bytes;}};
 const r=await e.value.generateDocxTo(d,provider,sink.output,{textLayout:'native'});expect(r.ok,JSON.stringify(r)).toBe(true);
 const z=await JSZip.loadAsync(Buffer.concat(sink.chunks)),xml=await z.file('word/footnotes.xml')!.async('string'),rels=await z.file('word/_rels/footnotes.xml.rels')!.async('string');
 expect(xml).toContain('<w:tbl>');expect(xml).toContain('<w:drawing>');expect(xml).toContain('<w:hyperlink');expect(xml).toContain('SIGN');expect(rels).toContain('https://example.com');expect(rels).toContain('/image');
});
