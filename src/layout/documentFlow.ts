import type { Issue } from '../result.js';
import {FormatStop,formatCursor,formatWarning,instanceForNode} from './formatLayout.js';
import type {FormatInstance} from '../composition/resolvedDocument.js';
import { measureRule } from './line.js';
import type { PageFieldSlot } from '../pdf/drawContract.js';
import { assignSystemPageNumbers } from './systemPageCounting.js';
import { measurePageBand, selectPageBands, type MeasuredBand } from './pageBands.js';
import type { BandMode } from '../template/types.js';
import { measureFixedTextBlock } from './fixedTextBlock.js';
import { cellTableFlow } from './cellTableFlow.js';
import {tableStartHeight}from'./tableStart.js';
import { collectContents } from '../composition/contents.js';
import { measureContents } from './measureContents.js';
import { toPt } from '../composition/resolvedDocument.js';
import type { ResolvedDocument, Table } from '../composition/resolvedDocument.js';
import type { DrawDocument, DrawPage, DrawImage } from '../pdf/drawContract.js';
import { LayoutError } from './textFlow.js';
import type { TextRuntime } from './textFlow.js';
import { measureText } from './measureText.js';
import type { MeasuredLine } from './measureText.js';
import type { PdfImageMetadata } from '../pdf/streamResources.js';
const epsilon = 1e-6;
export async function documentFlow(d: ResolvedDocument, runtime: TextRuntime, images: PdfImageMetadata = {},bounds?:{maxPages:number;maxImagePlacements?:number;signal?:AbortSignal|undefined;onSectionEnd?:(extent:{y:number;top:number;bottom:number})=>void}): Promise<DrawDocument> {
    const warnings: Issue[] = [];
    const omittedNodeIds=new Set<string>();
    let fixed:{instance:FormatInstance;start:number;end:number}|undefined;
    const pending=(id:string,kind:'text'|'image'|'node',extra:Partial<import('./formatLayout.js').FormatCursor>={})=>formatCursor(d,id,kind,extra);
    try {
    let widthPt = 0, heightPt = 0, left = 0, top = 0, bottom = 0, available = 0, innerTop = 0, innerBottom = 0;
    const limit=()=>fixed?.end??bottom;
    let modes: {
        headerMode?: BandMode;
        footerMode?: BandMode;
    } = {}, bands: Partial<Record<'header' | 'footer', MeasuredBand>> = {};
    let activeBands: Pick<ResolvedDocument, 'header' | 'footer'> = d;
    const bandCache = new Map<string, MeasuredBand>();
    const setPage = (page: ResolvedDocument['book']['page']) => {
        const [w, h] = page.orientation === 'portrait' ? [210, 297] : [297, 210];
        widthPt = w! * 72 / 25.4;
        heightPt = h! * 72 / 25.4;
        left = toPt(page.margin.left);
        top = toPt(page.margin.top);
        bottom = heightPt - toPt(page.margin.bottom);
        available = widthPt - left - toPt(page.margin.right);
    };
    setPage(d.book.page);
    innerTop = top;
    innerBottom = bottom;
    let sectionId: string | undefined, sectionPageIndex = 0, cover = false, activeNode = '';
    let pageRole: 'body' | 'cover' | 'blank' = 'body';
    const contentsSlots: NonNullable<DrawDocument['contentsSlots']> = [];
    const contentsById = new Map<string, ReturnType<typeof collectContents>>();
    const contentsByScope = new Map<string, ReturnType<typeof collectContents>>();
    for(const id of d.rootIds){const node=d.nodes[id];if(node?.type!=='table-of-contents')continue;
        const owner=d.nodeModelVersion===19&&node.props.scope?.kind==='section'?d.sourceMap[id]!.sectionId:undefined;
        const key=owner===undefined?'document':'section:'+owner;
        if(!contentsByScope.has(key))contentsByScope.set(key,collectContents(d,owner));
        contentsById.set(id,contentsByScope.get(key)!);
    }
    const pageTexts: NonNullable<DrawDocument['pageTexts']> = [];
    const pageFieldSlots: PageFieldSlot[] = [];
    let hideNumbers = false;
    const pages: DrawPage[] = [];
    let current!: DrawPage, y = top, serial = 0;
    let imagePlacements=0;
    const addImage=(image:DrawImage)=>{
        bounds?.signal?.throwIfAborted();
        if(bounds&&imagePlacements>=(bounds.maxImagePlacements??10000))throw new LayoutError(image.nodeId,'Image placement limit exceeded',sectionId);
        imagePlacements++;current.images??=[];current.images.push(image);
    };
    const bandRegion = (kind: 'header' | 'footer') => { const p = activeBands[kind]?.placement; return p ? { left: toPt(p.left), width: widthPt - toPt(p.left) - toPt(p.right), edge: kind === 'header' ? toPt(p.offset) : heightPt - toPt(p.offset) } : { left, width: available, edge: kind === 'header' ? innerTop : innerBottom }; };
    const geometry = (index: number) => {
        const shown = selectPageBands(modes, pageRole, index), h = shown.header ? bands.header : undefined, f = shown.footer ? bands.footer : undefined;
        const hy = bandRegion('header').edge, fy = bandRegion('footer').edge - (f?.heightPt ?? 0);
        for (const [kind, m, at] of [['header', h, hy], ['footer', f, fy]] as const)
            if (m && (at < 0 || at + m.heightPt > heightPt + epsilon))
                throw new LayoutError(activeBands[kind]?.rootIds[0] ?? activeNode, 'Page band exceeds physical page', sectionId, kind + '.placement');
        const hg = activeBands.header?.gap ? toPt(activeBands.header.gap) : 0, fg = activeBands.footer?.gap ? toPt(activeBands.footer.gap) : 0;
        const probeTop=runtime.spacingProbe?.bodyTopPt?.(sectionId);
        if(probeTop!==undefined&&(!Number.isFinite(probeTop)||probeTop<0||probeTop>=heightPt))throw new LayoutError(activeNode,'Invalid spacing probe body top');
        const nt = Math.max(h ? Math.max(innerTop, hy + h.heightPt + hg) : innerTop,probeTop??0);
        const probeBottom=runtime.spacingProbe?.bodyBottomPt?.(sectionId);
        if(probeBottom!==undefined&&(!Number.isFinite(probeBottom)||probeBottom<=nt||probeBottom>heightPt))throw new LayoutError(activeNode,'Invalid spacing probe body bottom');
        const nb = Math.min(f ? Math.min(innerBottom, fy - fg) : innerBottom,probeBottom??heightPt);
        if (Math.max((h ? h.heightPt + hg : 0) + (f ? f.heightPt + fg : 0), nt - innerTop + innerBottom - nb) > (innerBottom - innerTop) * .4 + epsilon)
            throw new LayoutError((h ? activeBands.header : activeBands.footer)?.rootIds[0] ?? activeNode, 'Page bands exceed 40 percent of inner page height', sectionId, (h ? 'header' : 'footer') + '.sizing');
        return { top: nt, bottom: nb, h, f, hy, fy };
    };
    const nextPage = () => {
        bounds?.signal?.throwIfAborted();
        if(bounds&&pages.length>=bounds.maxPages)throw new LayoutError(activeNode,'Page limit exceeded',sectionId);
        if(fixed)throw new FormatStop('height-limit',[pending(activeNode,'node',{nodeType:d.nodes[activeNode]?.type??'table'})]);
        if (cover && sectionPageIndex > 0)
            throw new LayoutError(activeNode, 'Cover exceeds one page');
        const g = geometry(sectionPageIndex);
        top = g.top;
        bottom = g.bottom;
        current = { ...({ pageRole }), widthPt, heightPt, backgroundColor: 'FFFFFF', commands: [], ...(sectionId === undefined ? {} : { sectionId, sectionPageIndex: sectionPageIndex++ }) };
        pages.push(current);
        y = top;
        for (const [kind, m, at] of [['header', g.h, g.hy], ['footer', g.f, g.fy]] as const) {
            if (!m)
                continue;
            if (m.borders.length) {
                current.borders ??= [];
                for (const b of m.borders)
                    current.borders.push({ ...b, x1Pt: bandRegion(kind).left + b.x1Pt, x2Pt: bandRegion(kind).left + b.x2Pt, y1Pt: at + b.y1Pt, y2Pt: at + b.y2Pt });
            }
            for (const run of m.commands)
                if (!hideNumbers || !m.numberBlocks.has(run.nodeId))
                    current.commands.push({ ...run, id: `${kind}-${pages.length}-${run.id}`, bounds: { ...run.bounds, xPt: bandRegion(kind).left + run.bounds.xPt, yPt: at + run.bounds.yPt } });
            if (!hideNumbers)
                for (const slot of m.pageFields)
                    pageFieldSlots.push({ ...slot, pageIndex: pages.length - 1, sectionId: sectionId!, xPt: bandRegion(kind).left + slot.xPt, yPt: at + slot.yPt });
            if (!hideNumbers)
                for (const t of m.pageTexts)
                    pageTexts.push({ ...t, pageIndex: pages.length - 1, sectionId: sectionId!, xPt: bandRegion(kind).left + t.xPt, yPt: at + t.yPt });
            if (m.images.length) {
                for (const image of m.images)
                    addImage({ ...image, xPt: bandRegion(kind).left + image.xPt, yPt: at + image.yPt });
            }
        }
    };
    const ensureHeight = (height: number, id: string, cursor= pending(id,'node',{nodeType:d.nodes[id]?.type??'text-block'})) => { if(fixed&&y+height>limit()+epsilon)throw new FormatStop(cursor.kind==='image'?'image-does-not-fit':'height-limit',[cursor]); if (y + height > bottom + epsilon)
        nextPage(); if (height > bottom - top + epsilon)
        throw new LayoutError(id, 'Item exceeds page content height'); };
    const emitLine = (line: MeasuredLine, x: number, at: number) => { if (line.run)
        current.commands.push({ ...line.run, id: `run-${serial++}`, bounds: { ...line.run.bounds, xPt: x + line.run.bounds.xPt, yPt: at } }); };
    const measureBlock = async (id: string, width: number) => { const n = d.nodes[id]; if (n?.type !== 'text-block')
        throw new LayoutError(id, 'Expected a TextBlock'); return measureText(n, d.styles[n.props.textStyleId]!, width, runtime); };
    const table = async (t: Table) => {
        const bounded=!!fixed; if(bounded)y+=.25;
        {
            await cellTableFlow(d, t, runtime, {bounded, omitImage(nodeId){const f=instanceForNode(d,nodeId);if(fixed||f?.sizing.mode!=='auto')return false;warnings.push(formatWarning(f,'FORMAT_IMAGE_NOT_SHOWN',{reason:'image-exceeds-page',pending:[pending(nodeId,'image')]}));omittedNodeIds.add(nodeId);return true;}, warn(issue) { warnings.push(issue); }, get top() { return bounded?fixed!.start+.25:top; }, get bottom() { return bounded?limit()-.25:limit(); }, get nextCapacity() { if(fixed)return 0; const g = geometry(sectionPageIndex); return g.bottom - g.top; }, left, availableWidth: available, get y() { return y; }, set y(v) { y = v; }, nextPage,
                fill(xPt, yPt, widthPt, heightPt, color, nodeId) { current.fills ??= []; current.fills.push({ xPt, yPt, widthPt, heightPt, color, nodeId }); },
                emitItem(item, x, at, width) {
                    if (item.kind === 'text-line') {
                        emitLine(item.line, x, at);
                        return;
                    }
                    const image = Object.hasOwn(images, item.resourceId) ? images[item.resourceId] : undefined;
                    if (!image)
                        return;
                    const fw = item.frameWidth, fh = item.heightPt, scale = Math.min(fw / image.width, fh / image.height), iw = image.width * scale, ih = image.height * scale;
                    const frameLeft = x + (item.align === 'right' ? width - fw : item.align === 'center' ? (width - fw) / 2 : 0);
                    addImage({ nodeId: item.nodeId, resourceId: item.resourceId, xPt: frameLeft + (fw - iw) / 2, yPt: at + (fh - ih) / 2, widthPt: iw, heightPt: ih });
                }, border(x1Pt, y1Pt, x2Pt, y2Pt, nodeId) { if(bounded){x1Pt=Math.max(left+.25,Math.min(left+available-.25,x1Pt));x2Pt=Math.max(left+.25,Math.min(left+available-.25,x2Pt));} current.borders ??= []; current.borders.push({ x1Pt, y1Pt, x2Pt, y2Pt, nodeId, widthPt: 0.5, color: t.props.borderColor ?? '000000' }); }
            });
            if(bounded)y+=.25;
            return;
        }
    };
    const sections = d.sections!;
    for (const section of sections) {
        if (!section.rootIds.some(id => d.nodes[id]?.type !== 'page-break' && (d.nodeModelVersion!==19||d.nodes[id]?.type!=='table-of-contents'||contentsById.get(id)!.length>0)) && !d.formatInstances?.some(f=>f.sectionId===section.sectionId&&f.sizing.mode==='fixed') && !((section.role === 'cover' || section.sourceKind === 'blank')))
            continue;
        hideNumbers = "numbering" in section && section.numbering?.visibility === 'hide';
        sectionId = section.sectionId;
        sectionPageIndex = 0;
        cover = section.role === 'cover';
        pageRole = cover ? 'cover' : section.sourceKind === 'blank' ? 'blank' : 'body';
        setPage(section.page);
        innerTop = top;
        innerBottom = bottom;
        modes = section as typeof modes;
        bands = {};
        activeBands = section as Pick<ResolvedDocument, 'header' | 'footer'>;
        if (pageRole === 'body')
            for (const k of ['header', 'footer'] as const) {
                const b = activeBands[k];
                if (!b || modes[k === 'header' ? 'headerMode' : 'footerMode'] === 'none')
                    continue;
                const region = bandRegion(k);
                if (region.width <= 0)
                    throw new LayoutError(b.rootIds[0] ?? 'page-band', 'Page band has no available width', sectionId, k + '.placement');
                const key = (sectionId + ':') + k + ':' + region.width;
                let m = bandCache.get(key);
                if (!m) {
                    try {
                        m = await measurePageBand(b, d.styles, region.width, runtime, images);
                    }
                    catch (e) {
                        if (e instanceof LayoutError)
                            throw new LayoutError(e.nodeId, e.message, sectionId, k + '.nodes.' + e.nodeId + (e.path ? '.' + e.path : ''));
                        throw e;
                    }
                    bandCache.set(key, m);
                }
                bands[k] = m;
            }
        nextPage();
        let pendingBreak = false;
        let previousRoot:string|undefined;
        const renderRoot=async(id:string)=> {
            const previous=previousRoot;previousRoot=id;
            activeNode = id;
            const n = d.nodes[id];
            if (n?.type === 'page-break') {
                if(fixed)throw new FormatStop('explicit-page-break',[pending(id,'node',{nodeType:'page-break'})]);
                pendingBreak = true;
                return;
            }
            if (n?.type === 'table' && !n.rowIds.length)
                return;
            const contents = n?.type === 'table-of-contents' ? await measureContents(n, contentsById.get(id)!, d.styles[n.props.textStyleId]!, available, runtime) : undefined;
            if (contents && !contents.length)
                return;
            if (pendingBreak) {
                if (y > top + epsilon)
                    nextPage();
                pendingBreak = false;
            }
            if(!fixed&&n?.type==='text-block'&&n.props.toc&&runtime.spacingProbe?.keepTableStart?.(id)){
                const index=section.rootIds.indexOf(id),next=section.rootIds.slice(index+1,index+3),prefix=[id];
                let t=d.nodes[next[0]!];
                if(t?.type==='text-block'&&!t.props.toc&&d.nodes[next[1]!]?.type==='table'){
                    prefix.push(t.id);t=d.nodes[next[1]!];
                }
                if(t?.type==='table'&&t.rowIds.length){
                    let required=await tableStartHeight(d,t,runtime);
                    for(const p of prefix)required+=(await measureBlock(p,available)).reduce((sum,line)=>sum+line.heightPt,0);
                    const full=geometry(sectionPageIndex).bottom-geometry(sectionPageIndex).top;
                    if(required>full+epsilon)throw new LayoutError(id,'Table-start group exceeds page content height');
                    if(y+required>bottom+epsilon&&y>top+epsilon)nextPage();
                }
            }
            if (n?.type === 'table') {
                if(previous&&d.nodes[previous]?.type==='table'){
                    const gap=runtime.spacingProbe?.tableBoundaryPt?.(previous,id)??0;
                    if(!Number.isFinite(gap)||gap<0||gap>100)throw new LayoutError(id,'Invalid spacing probe table boundary');
                    // The separator belongs to the ending page. Table flow resets
                    // y if it must continue on a fresh page, so no leading gap leaks.
                    if(y>top+epsilon)y+=gap;
                }
                await table(n);
            }
            else if (n?.type === 'text-block') {
                if (n.props.heightMode === 'fixed') {
                    const measured = await measureFixedTextBlock(n, d.styles[n.props.textStyleId]!, available, runtime);
                    if(fixed&&y+measured.heightPt>limit()+epsilon)throw new FormatStop('unbreakable-item-does-not-fit',[pending(id,'node',{nodeType:'text-block'})]);
                    if (y + measured.heightPt > bottom + epsilon)
                        throw new LayoutError(id, 'Reserved frame exceeds cover content area');
                    let at = y + measured.offsetPt;
                    for (const line of measured.lines) {
                        emitLine(line, left, at);
                        at += line.heightPt;
                    }
                    y += measured.heightPt;
                    return;
                }
                let lineIndex=0;
                for (const line of await measureBlock(id, available)) {
                    ensureHeight(line.heightPt, id,pending(id,'text',{lineIndex, ...(line.run?.sourceStart===undefined?{}:{sourceOffset:line.run.sourceStart})}));
                    emitLine(line, left, y);
                    y += line.heightPt;
                    lineIndex++;
                }
            }
            else if (n?.type === 'table-of-contents') {
                for (const measured of contents!) {
                    const { line, xOffsetPt, numberSlot } = measured;
                    ensureHeight(line.heightPt, n.id);
                    emitLine(line, left + xOffsetPt, y);
                    if (numberSlot)
                        contentsSlots.push({ nodeId: n.id, ...numberSlot, pageIndex: pages.length - 1, xPt: left + available - numberSlot.widthPt, yPt: y });
                    y += line.heightPt;
                }
            }
            else if (n?.type === 'line') {
                const m = measureRule(n, available);
                ensureHeight(m.height, id);
                current.borders ??= [];
                current.borders.push({ nodeId: id, x1Pt: left + m.offset, x2Pt: left + m.offset + m.width, y1Pt: y + m.before + m.thickness / 2, y2Pt: y + m.before + m.thickness / 2, widthPt: m.thickness, color: m.color });
                y += m.height;
            }
            else if (n?.type === 'image') {
                const fw = toPt(n.props.width), fh = toPt(n.props.height);
                if (fw > available + epsilon)
                    throw new LayoutError(id, 'Image frame exceeds printable page');
                const instance=instanceForNode(d,id);
                if(!fixed&&instance?.sizing.mode==='auto'&&fh>Math.max(bottom-top,geometry(sectionPageIndex).bottom-geometry(sectionPageIndex).top)+epsilon){
                    warnings.push(formatWarning(instance,'FORMAT_IMAGE_NOT_SHOWN',{reason:'image-exceeds-page',pending:[pending(id,'image')]}));omittedNodeIds.add(id);return;
                }
                ensureHeight(fh, id,pending(id,'image'));
                const image = Object.hasOwn(images, n.props.resourceId) ? images[n.props.resourceId] : undefined;
                const frameLeft = left + (n.props.align === 'right' ? available - fw : n.props.align === 'center' ? (available - fw) / 2 : 0);
                if (image) {
                    const scale = Math.min(fw / image.width, fh / image.height), iw = image.width * scale, ih = image.height * scale;
                    addImage({ nodeId: id, resourceId: n.props.resourceId, xPt: frameLeft + (fw - iw) / 2, yPt: y + (fh - ih) / 2, widthPt: iw, heightPt: ih });
                }
                y += fh;
            }
            else
                throw new LayoutError(id, 'Unsupported root');
        };
        const instances=(d.formatInstances??[]).filter(f=>f.sectionId===section.sectionId&&f.rootStartIndex!==undefined).sort((a,b)=>a.rootStartIndex!-b.rootStartIndex!);
        const ending=section.endingArea;
        const renderEnding=async()=>{
            if(!ending?.rootIds.length)return;
            if(pendingBreak){if(y>top+epsilon)nextPage();pendingBreak=false;}
            // Measure only this Area with the same shared flow, never caller fit
            // hints. It has no endingArea, so this bounded probe cannot recurse.
            const measure=async(g:{top:number;bottom:number})=>{
                const {endingArea:_,header:__,footer:___,...source}=section;
                let extent=0;
                const probe:ResolvedDocument={...d,rootIds:ending.rootIds,sections:[{...source,rootIds:ending.rootIds,headerMode:'none',footerMode:'none',page:{...section.page,margin:{...section.page.margin,top:{unit:'pt',value:g.top},bottom:{unit:'pt',value:heightPt-g.bottom}}}}],
                    formatInstances:(d.formatInstances??[]).filter(f=>f.sectionId===section.sectionId&&f.areaId===ending.areaId).map(f=>({...f,...f.rootStartIndex===undefined?{}:{rootStartIndex:f.rootStartIndex-ending.rootStartIndex}}))};
                const draw=await documentFlow(probe,runtime,images,{maxPages:bounds?.maxPages??10000,...bounds?.signal?{signal:bounds.signal}:{},maxImagePlacements:bounds?.maxImagePlacements??10000,onSectionEnd:e=>{extent=e.y-e.top;}});
                return {pages:draw.pages.length,height:extent};
            };
            let size=await measure({top,bottom});
            const adjacent=previousRoot&&d.nodes[previousRoot]?.type==='table'&&d.nodes[ending.rootIds[0]!]?.type==='table';
            const gap=adjacent?(runtime.spacingProbe?.tableBoundaryPt?.(previousRoot!,ending.rootIds[0]!)??0):0;
            if(!Number.isFinite(gap)||gap<0||gap>100)throw new LayoutError(ending.rootIds[0]!,'Invalid spacing probe table boundary');
            if(size.pages===1&&y+gap+size.height<=bottom+epsilon){y=bottom-size.height;previousRoot=undefined;}
            else{
                const next=geometry(sectionPageIndex),nextSize=await measure(next);
                if(nextSize.pages===1&&nextSize.height<=next.bottom-next.top+epsilon){nextPage();size=nextSize;y=bottom-size.height;previousRoot=undefined;}
            }
            // Oversized Areas keep ordinary flow. Only their last-page fragment
            // moves down, and all geometries/field slots move together.
            const firstPage=pages.length-1;
            for(const id of ending.rootIds)await renderRoot(id);
            const delta=Math.max(0,bottom-y),lastPage=pages.length-1;
            const owns=(id:string)=>d.sourceMap[id]?.sectionId===section.sectionId&&d.sourceMap[id]?.areaId===ending.areaId;
            if(delta>epsilon){
                for(const c of current.commands)if(owns(c.nodeId))c.bounds={...c.bounds,yPt:c.bounds.yPt+delta};
                for(const b of current.borders??[])if(owns(b.nodeId)){b.y1Pt+=delta;b.y2Pt+=delta;}
                for(const f of current.fills??[])if(owns(f.nodeId))f.yPt+=delta;
                for(const i of current.images??[])if(owns(i.nodeId))i.yPt+=delta;
                for(const slot of [...pageTexts,...pageFieldSlots,...contentsSlots])if(slot.pageIndex===lastPage&&owns('nodeId' in slot?slot.nodeId:slot.node.id))slot.yPt+=delta;
            }
            if(lastPage>=firstPage)y=bottom;
        };
        let position=0,fi=0;
        while(position<section.rootIds.length||fi<instances.length){
            if(ending?.rootIds.length&&position===ending.rootStartIndex){await renderEnding();position=section.rootIds.length;fi=instances.length;continue;}
            const f=instances[fi];
            if(!f||f.rootStartIndex!==position){await renderRoot(section.rootIds[position++]!);continue;}
            fi++;
            if(f.sizing.mode==='auto'){for(const id of f.rootIds)await renderRoot(id);position+=f.rootIds.length;continue;}
            if(pendingBreak){if(y>top+epsilon)nextPage();pendingBreak=false;}
            const height=toPt(f.sizing.height),availableHeight=Math.max(0,bottom-y),completed=new Set<string>();
            const markOmitted=(processed:string[]=[])=>{const shown=new Set(processed),remaining=f.rootIds.filter(id=>!completed.has(id)),todo=[...remaining];while(todo.length){const id=todo.pop()!;if(shown.has(id))continue;omittedNodeIds.add(id);const n=d.nodes[id];if(!n)continue;for(const key of ['rowIds','cellIds','childIds'] as const)if(key in n)todo.push(...(n as unknown as Record<string,string[]>)[key]!);}};
            if(availableHeight===0){warnings.push(formatWarning(f,'FORMAT_FRAME_NOT_SHOWN',{reason:'insufficient-page-space',sectionPageIndex:sectionPageIndex-1,requiredHeightPt:height,availableHeightPt:availableHeight}));markOmitted();}
            else {
                // A declared fixed height is a maximum within this page's remainder.
                fixed={instance:f,start:y,end:Math.min(y+height,bottom)};
                try{for(const id of f.rootIds){await renderRoot(id);completed.add(id);}}
                catch(error){if(!(error instanceof FormatStop))throw error;warnings.push(formatWarning(f,'FORMAT_CONTENT_OMITTED',{reason:error.reason,pending:error.pending}));markOmitted(error.completedNodeIds);}
                finally{y=fixed.end;fixed=undefined;}
            }
            position+=f.rootIds.length;
        }
        bounds?.onSectionEnd?.({y,top,bottom});
    }
    if(d.nodeModelVersion===19&&!pages.length)throw new LayoutError(d.rootIds[0]??'document','No layout content in document');
    assignSystemPageNumbers(d, { pages });
    return { pages, ...(omittedNodeIds.size?{omittedNodeIds:[...omittedNodeIds]}:{}), ...(warnings.length ? { warnings } : {}), ...(pageTexts.length ? { pageTexts } : {}), ...(pageFieldSlots.length ? { pageFieldSlots } : {}), ...(contentsSlots.length ? { contentsSlots } : {}) };
    }catch(error){if(error instanceof LayoutError)error.warnings=warnings;throw error;}
}
