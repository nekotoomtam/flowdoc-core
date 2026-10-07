// Text/font PDF primitives extracted from flowdoc-vnext-core fa76c74356e5cfc9296f6a86c0bfac690e8416f6.
// Private JavaScript preserves the existing glyph/Unicode/object assembly algorithms.
function formatNumber(value) {
    return Number(value.toFixed(6)).toString();
}
function scaleMetric(value, unitsPerEm) {
    return Math.round(value / unitsPerEm * 1000);
}
function parseSfnt(bytes) {
    const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (buffer.length < 12 || buffer.readUInt32BE(0) !== 0x00010000) {
        throw new Error("font must be a TrueType sfnt");
    }
    const numTables = buffer.readUInt16BE(4);
    if (12 + numTables * 16 > buffer.length)
        throw new Error("sfnt table directory is truncated");
    const tables = new Map();
    for (let index = 0; index < numTables; index += 1) {
        const recordOffset = 12 + index * 16;
        const tag = buffer.toString("ascii", recordOffset, recordOffset + 4);
        const offset = buffer.readUInt32BE(recordOffset + 8);
        const length = buffer.readUInt32BE(recordOffset + 12);
        if (offset + length > buffer.length)
            throw new Error(`sfnt table is truncated: ${tag}`);
        tables.set(tag, { offset, length });
    }
    const requireTable = (tag, minimumLength) => {
        const table = tables.get(tag);
        if (table == null || table.length < minimumLength)
            throw new Error(`sfnt table is missing: ${tag}`);
        return table.offset;
    };
    const head = requireTable("head", 54);
    const hhea = requireTable("hhea", 36);
    const maxp = requireTable("maxp", 6);
    const post = requireTable("post", 8);
    const os2Table = tables.get("OS/2");
    const unitsPerEm = buffer.readUInt16BE(head + 18);
    if (unitsPerEm <= 0)
        throw new Error("sfnt unitsPerEm must be positive");
    const ascent = buffer.readInt16BE(hhea + 4);
    const descent = buffer.readInt16BE(hhea + 6);
    const os2Version = os2Table == null ? 0 : buffer.readUInt16BE(os2Table.offset);
    const capHeight = os2Table != null && os2Version >= 2 && os2Table.length >= 90
        ? buffer.readInt16BE(os2Table.offset + 88)
        : ascent;
    return {
        unitsPerEm,
        numGlyphs: buffer.readUInt16BE(maxp + 4),
        fontBBox: [
            scaleMetric(buffer.readInt16BE(head + 36), unitsPerEm),
            scaleMetric(buffer.readInt16BE(head + 38), unitsPerEm),
            scaleMetric(buffer.readInt16BE(head + 40), unitsPerEm),
            scaleMetric(buffer.readInt16BE(head + 42), unitsPerEm),
        ],
        ascent: scaleMetric(ascent, unitsPerEm),
        descent: scaleMetric(descent, unitsPerEm),
        capHeight: scaleMetric(capHeight, unitsPerEm),
        italicAngle: buffer.readInt32BE(post + 4) / 65536,
    };
}
function unicodeAssignments(command, allowClusterContinuation) {
    const assignments = new Array(command.glyphs.length);
    const groups = new Map();
    command.glyphs.forEach((glyph, index) => {
        const key = `${glyph.clusterStartOffset}:${glyph.clusterEndOffset}`;
        const indexes = groups.get(key) ?? [];
        indexes.push(index);
        groups.set(key, indexes);
    });
    for (const indexes of groups.values()) {
        const first = command.glyphs[indexes[0]];
        const scalars = Array.from(command.text.slice(first.clusterStartOffset, first.clusterEndOffset));
        if (allowClusterContinuation) {
            const clusterText = scalars.join("");
            if (clusterText.length === 0)
                return null;
            indexes.forEach((glyphIndex) => {
                assignments[glyphIndex] = "";
            });
            const primaryIndexes = indexes.filter((glyphIndex) => command.glyphs[glyphIndex].offsetYPt === 0);
            if (primaryIndexes.length === 0)
                return null;
            if (scalars.length < primaryIndexes.length) {
                const mappedIndex = primaryIndexes.find((glyphIndex) => command.glyphs[glyphIndex].advancePt > 0)
                    ?? primaryIndexes[0];
                assignments[mappedIndex] = clusterText;
            }
            else {
                primaryIndexes.forEach((glyphIndex, index) => {
                    assignments[glyphIndex] = index === primaryIndexes.length - 1
                        ? scalars.slice(index).join("")
                        : scalars[index];
                });
            }
            continue;
        }
        if (scalars.length < indexes.length)
            return null;
        indexes.forEach((glyphIndex, index) => {
            assignments[glyphIndex] = index === indexes.length - 1
                ? scalars.slice(index).join("")
                : scalars[index];
        });
    }
    return assignments.every((value) => value != null) ? assignments : null;
}
function utf16BeHex(value) {
    let output = "";
    for (let index = 0; index < value.length; index += 1) {
        output += value.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
    }
    return output;
}
function actualTextHex(value) {
    return `FEFF${utf16BeHex(value)}`;
}
function colorOperands(hex) {
    return [0, 2, 4]
        .map((offset) => formatNumber(Number.parseInt(hex.slice(offset, offset + 2), 16) / 255))
        .join(" ");
}
function toUnicodeCMap(usage) {
    const mappings = usage.glyphs.map((glyph) => (`<${glyph.cid.toString(16).padStart(4, "0").toUpperCase()}> <${utf16BeHex(glyph.unicode)}>`));
    const sections = [];
    for (let offset = 0; offset < mappings.length; offset += 100) {
        const chunk = mappings.slice(offset, offset + 100);
        sections.push(`${chunk.length} beginbfchar\n${chunk.join("\n")}\nendbfchar`);
    }
    return Buffer.from([
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin",
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def",
        `/CMapName /${usage.pdfBaseFontName}-UCS def`,
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000> <FFFF>",
        "endcodespacerange",
        ...sections,
        "endcmap",
        "CMapName currentdict /CMap defineresource pop",
        "end",
        "end",
        "",
    ].join("\n"), "ascii");
}
function cidToGidMap(usage) {
    const maxCid = usage.glyphs.at(-1)?.cid ?? 0;
    const bytes = Buffer.alloc((maxCid + 1) * 2);
    usage.glyphs.forEach((glyph) => bytes.writeUInt16BE(glyph.glyphId, glyph.cid * 2));
    return bytes;
}
function widths(usage) {
    return usage.glyphs.map((glyph) => formatNumber(glyph.width)).join(" ");
}
function streamObject(dictionary, bytes) {
    return Buffer.concat([
        Buffer.from(`<< ${dictionary} /Length ${bytes.byteLength} >>\nstream\n`, "ascii"),
        Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        Buffer.from("\nendstream", "ascii"),
    ]);
}
function plainObject(value) {
    return Buffer.from(value, "ascii");
}
function createPageContent(page) {
    return [
        "q",
        `${colorOperands(page.backgroundColor)} rg`,
        `0 0 ${formatNumber(page.widthPt)} ${formatNumber(page.heightPt)} re f`,
        "Q",
    ];
}
function appendText(content, page, command, usages, resolvedRuns) {
    const usage = usages.find((candidate) => candidate.asset.fontId === command.fontId);
    const glyphs = resolvedRuns.get(command.id);
    if (usage == null || glyphs == null)
        throw new Error(`unresolved glyph run: ${command.id}`);
    if (glyphs.some((glyph) => glyph.unicode.length === 0)) {
        const textArray = [];
        let currentOffset = 0;
        glyphs.forEach((glyph, glyphIndex) => {
            const measured = command.glyphs[glyphIndex];
            if (measured.offsetYPt !== 0)
                return;
            const adjustment = -(glyph.offsetX - currentOffset);
            if (adjustment !== 0)
                textArray.push(formatNumber(adjustment));
            textArray.push(`<${glyph.cid.toString(16).padStart(4, "0").toUpperCase()}>`);
            currentOffset = glyph.offsetX;
        });
        content.push(`/Span << /ActualText <${actualTextHex(command.text)}> >> BDC`, "BT", `/${usage.pdfResourceName} ${formatNumber(command.fontSizePt)} Tf`, `${colorOperands(command.color)} rg`, `1 0 0 1 ${formatNumber(command.bounds.xPt)} ${formatNumber(page.heightPt - command.bounds.yPt - command.baselineOffsetPt)} Tm`, `[${textArray.join(" ")}] TJ`, "ET", "EMC");
        const overlayOperators = [];
        let cursorXPt = 0;
        glyphs.forEach((glyph, glyphIndex) => {
            const measured = command.glyphs[glyphIndex];
            if (measured.offsetYPt !== 0) {
                overlayOperators.push(`1 0 0 1 ${formatNumber(command.bounds.xPt + cursorXPt + measured.offsetXPt)} ${formatNumber(page.heightPt - command.bounds.yPt - command.baselineOffsetPt + measured.offsetYPt)} Tm`, `<${glyph.cid.toString(16).padStart(4, "0").toUpperCase()}> Tj`);
            }
            cursorXPt += measured.advancePt;
        });
        if (overlayOperators.length > 0) {
            content.push("/Artifact BMC", "BT", `/${usage.pdfResourceName} ${formatNumber(command.fontSizePt)} Tf`, `${colorOperands(command.color)} rg`, ...overlayOperators, "ET", "EMC");
        }
    }
    else {
        const textArray = [];
        let currentOffset = 0;
        glyphs.forEach((glyph) => {
            const adjustment = -(glyph.offsetX - currentOffset);
            if (adjustment !== 0)
                textArray.push(formatNumber(adjustment));
            textArray.push(`<${glyph.cid.toString(16).padStart(4, "0").toUpperCase()}>`);
            currentOffset = glyph.offsetX;
        });
        content.push(`/Span << /ActualText <${actualTextHex(command.text)}> >> BDC`, "BT", `/${usage.pdfResourceName} ${formatNumber(command.fontSizePt)} Tf`, `${colorOperands(command.color)} rg`, `1 0 0 1 ${formatNumber(command.bounds.xPt)} ${formatNumber(page.heightPt - command.bounds.yPt - command.baselineOffsetPt)} Tm`, `[${textArray.join(" ")}] TJ`, "ET", "EMC");
    }
}
function buildPageContent(page, usages, resolvedRuns) {
    const content = createPageContent(page);
    for (const border of page.borders ?? []) {
        content.push('q', `${colorOperands(border.color)} RG`, `${formatNumber(border.widthPt)} w`,
            `${formatNumber(border.x1Pt)} ${formatNumber(page.heightPt-border.y1Pt)} m`,
            `${formatNumber(border.x2Pt)} ${formatNumber(page.heightPt-border.y2Pt)} l S`, 'Q');
    }
    for (const command of page.commands)
        appendText(content, page, command, usages, resolvedRuns);
    return Buffer.from(content.join('\n')+'\n', 'ascii');
}
function assemblePdf(contract, usages, imageUsages, pageContents) {
    const objects = new Map();
    const catalogId = 1;
    const pagesId = 2;
    const pageObjectIds = contract.pages.map((_, pageIndex) => 3 + pageIndex * 2);
    const contentObjectIds = pageObjectIds.map((pageId) => pageId + 1);
    let nextId = 3 + contract.pages.length * 2;
    const fontObjectIds = usages.map(() => {
        const ids = {
            type0: nextId,
            cidFont: nextId + 1,
            descriptor: nextId + 2,
            fontFile: nextId + 3,
            toUnicode: nextId + 4,
            cidToGid: nextId + 5,
        };
        nextId += 6;
        return ids;
    });
    const infoId = nextId;
    objects.set(catalogId, plainObject(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`));
    objects.set(pagesId, plainObject(`<< /Type /Pages /Kids [${pageObjectIds.map((pageId) => `${pageId} 0 R`).join(" ")}] /Count ${contract.pages.length} >>`));
    contract.pages.forEach((page, pageIndex) => {
        const pageId = pageObjectIds[pageIndex];
        const contentId = contentObjectIds[pageIndex];
        const pageFontIds = new Set(page.commands
            .filter((command) => command.kind === "glyph-run")
            .map((command) => command.fontId));
        const fontResources = usages.map((usage, index) => (pageFontIds.has(usage.asset.fontId)
            ? `/${usage.pdfResourceName} ${fontObjectIds[index].type0} 0 R`
            : null)).filter((value) => value != null).join(" ");
        const resources = `/Resources << /Font << ${fontResources} >> >>`;
        objects.set(pageId, plainObject([
            "<< /Type /Page",
            `/Parent ${pagesId} 0 R`,
            `/MediaBox [0 0 ${formatNumber(page.widthPt)} ${formatNumber(page.heightPt)}]`,
            resources,
            `/Contents ${contentId} 0 R >>`,
        ].join(" ")));
        objects.set(contentId, streamObject("", pageContents[pageIndex]));
    });
    usages.forEach((usage, index) => {
        const ids = fontObjectIds[index];
        const metrics = usage.metrics;
        objects.set(ids.type0, plainObject([
            "<< /Type /Font /Subtype /Type0",
            `/BaseFont /${usage.pdfBaseFontName}`,
            "/Encoding /Identity-H",
            `/DescendantFonts [${ids.cidFont} 0 R]`,
            `/ToUnicode ${ids.toUnicode} 0 R >>`,
        ].join(" ")));
        objects.set(ids.cidFont, plainObject([
            "<< /Type /Font /Subtype /CIDFontType2",
            `/BaseFont /${usage.pdfBaseFontName}`,
            "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>",
            `/FontDescriptor ${ids.descriptor} 0 R`,
            "/DW 1000",
            `/W [1 [${widths(usage)}]]`,
            `/CIDToGIDMap ${ids.cidToGid} 0 R >>`,
        ].join(" ")));
        objects.set(ids.descriptor, plainObject([
            "<< /Type /FontDescriptor",
            `/FontName /${usage.pdfBaseFontName}`,
            "/Flags 4",
            `/FontBBox [${metrics.fontBBox.join(" ")}]`,
            `/ItalicAngle ${formatNumber(metrics.italicAngle)}`,
            `/Ascent ${metrics.ascent}`,
            `/Descent ${metrics.descent}`,
            `/CapHeight ${metrics.capHeight}`,
            "/StemV 80",
            `/FontFile2 ${ids.fontFile} 0 R >>`,
        ].join(" ")));
        objects.set(ids.fontFile, streamObject(`/Length1 ${usage.resource.subsetBytes.byteLength}`, usage.resource.subsetBytes));
        objects.set(ids.toUnicode, streamObject("", toUnicodeCMap(usage)));
        objects.set(ids.cidToGid, streamObject("", cidToGidMap(usage)));
    });
    objects.set(infoId, plainObject("<< /Title (FlowDoc Document) /Producer (FlowDoc Core) >>"));
    const header = Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary");
    const parts = [header];
    const offsets = new Array(infoId + 1).fill(0);
    let byteOffset = header.length;
    for (let objectId = 1; objectId <= infoId; objectId += 1) {
        const body = objects.get(objectId);
        if (body == null)
            throw new Error(`missing PDF object ${objectId}`);
        const prefix = Buffer.from(`${objectId} 0 obj\n`, "ascii");
        const suffix = Buffer.from("\nendobj\n", "ascii");
        offsets[objectId] = byteOffset;
        parts.push(prefix, body, suffix);
        byteOffset += prefix.length + body.length + suffix.length;
    }
    const xrefOffset = byteOffset;
    const xref = [
        `xref\n0 ${infoId + 1}`,
        "0000000000 65535 f ",
        ...offsets.slice(1).map((offset) => `${offset.toString().padStart(10, "0")} 00000 n `),
    ].join("\n");
    const documentId = contract.fingerprint.slice("sha256:".length, "sha256:".length + 32).toUpperCase();
    const trailer = [
        xref,
        "trailer",
        `<< /Size ${infoId + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R /ID [<${documentId}> <${documentId}>] >>`,
        "startxref",
        xrefOffset.toString(),
        "%%EOF",
        "",
    ].join("\n");
    parts.push(Buffer.from(trailer, "ascii"));
    return Buffer.concat(parts);
}
export { parseSfnt, unicodeAssignments, buildPageContent, assemblePdf };
