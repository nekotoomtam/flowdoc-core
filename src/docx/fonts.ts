import { required } from './types.js';
import { fail, type ResourceFont, type FontIdentity } from './types.js';
export interface ParsedFont {
    identity: FontIdentity;
    bytes: Uint8Array;
    legacyAlias?: string;
    glyph: (cp: number) => number;
}
export function parseFont(f: ResourceFont, path: string): ParsedFont {
    const b = Buffer.from(f.bytes);
    const bad = (m: string): never => fail('DOCX_RESOURCE_INVALID', path, m);
    if (b.length < 12 || b.readUInt32BE(0) !== 0x10000)
        bad('Only valid standalone TrueType resources are supported in U1');
    const n = b.readUInt16BE(4), tables = new Map<string, {
        o: number;
        l: number;
    }>();
    if (n > 256 || 12 + n * 16 > b.length)
        bad('Invalid sfnt directory');
    for (let i = 0; i < n; i++) {
        const at = 12 + i * 16, tag = b.toString('ascii', at, at + 4), o = b.readUInt32BE(at + 8), l = b.readUInt32BE(at + 12);
        if (tables.has(tag) || o + l > b.length || o < 12 + n * 16)
            bad('Invalid sfnt table extent');
        tables.set(tag, { o, l });
    }
    if (tables.has('fvar'))
        fail('DOCX_CAPABILITY_UNSUPPORTED', path, 'Variable font instances are not enabled in U1');
    const table = (tag: string, min: number) => { const t = tables.get(tag); if (!t || t.l < min)
        bad('Missing font table ' + tag); return t!; };
    const head = table('head', 54), os2 = table('OS/2', 64), name = table('name', 6), cm = table('cmap', 4), maxp = table('maxp', 6);
    const units = b.readUInt16BE(head.o + 18), weight = b.readUInt16BE(os2.o + 4), fsType = b.readUInt16BE(os2.o + 8), flags = b.readUInt16BE(os2.o + 62), numGlyphs = b.readUInt16BE(maxp.o + 4);
    if (units < 16 || units > 16384 || !numGlyphs)
        bad('Invalid font metrics');
    const loca = table('loca', 2), glyf = table('glyf', 1), locationFormat = b.readInt16BE(head.o + 50);
    if (![0, 1].includes(locationFormat) || loca.l < (numGlyphs + 1) * (locationFormat === 0 ? 2 : 4))
        bad('Invalid glyph location table');
    let prior = 0;
    for (let i = 0; i <= numGlyphs; i++) {
        const offset = locationFormat === 0 ? b.readUInt16BE(loca.o + i * 2) * 2 : b.readUInt32BE(loca.o + i * 4);
        if (offset < prior || offset > glyf.l || offset !== prior && offset - prior < 10)
            bad('Invalid glyph outline extent');
        prior = offset;
    }
    if (fsType & 0x202)
        bad('Font embedding flags prohibit the requested embedded outline use');
    if (weight !== f.weight || !!(flags & 1) !== (f.style === 'italic'))
        bad('Requested weight/style differs from the concrete font face');
    const count = b.readUInt16BE(name.o + 2), storage = name.o + b.readUInt16BE(name.o + 4);
    if (6 + count * 12 > name.l)
        bad('Invalid font name directory');
    const names: {
        id: number;
        rank: number;
        value: string;
    }[] = [];
    for (let i = 0; i < count; i++) {
        const a = name.o + 6 + i * 12, platform = b.readUInt16BE(a), lang = b.readUInt16BE(a + 4), id = b.readUInt16BE(a + 6), len = b.readUInt16BE(a + 8), at = storage + b.readUInt16BE(a + 10);
        if (at < name.o || at + len > name.o + name.l)
            bad('Invalid font name');
        if ((platform === 0 || platform === 3) && len % 2 === 0) {
            let value = '';
            for (let j = 0; j < len; j += 2)
                value += String.fromCharCode(b.readUInt16BE(at + j));
            names.push({ id, rank: lang === 0x409 ? 0 : 1, value });
        }
    }
    names.sort((a, c) => a.rank - c.rank);
    const family = (names.find(x => x.id === 16) ?? names.find(x => x.id === 1))?.value;
    if (!family)
        bad('No supported Unicode family name');
    const cnt = b.readUInt16BE(cm.o + 2);
    if (4 + cnt * 8 > cm.l)
        bad('Invalid cmap directory');
    const candidates: {
        at: number;
        len: number;
        format: number;
    }[] = [];
    for (let i = 0; i < cnt; i++) {
        const a = cm.o + 4 + i * 8, p = b.readUInt16BE(a), enc = b.readUInt16BE(a + 2), at = cm.o + b.readUInt32BE(a + 4);
        if (at < cm.o || at + 4 > cm.o + cm.l)
            bad('Invalid cmap offset');
        if (p !== 0 && !(p === 3 && [1, 10].includes(enc)))
            continue;
        const format = b.readUInt16BE(at);
        if (![4, 12].includes(format))
            continue;
        if (at + (format === 12 ? 16 : 14) > cm.o + cm.l)
            bad('Truncated cmap');
        const len = format === 12 ? b.readUInt32BE(at + 4) : b.readUInt16BE(at + 2);
        if (len < 16 || at + len > cm.o + cm.l)
            bad('Invalid cmap length');
        candidates.push({ at, len, format });
    }
    candidates.sort((a, c) => c.format - a.format);
    if (!candidates.length)
        bad('No Unicode cmap4/12');
    const lookups = candidates.map(({ at, len, format }) => {
        if (format === 12) {
            const groups = b.readUInt32BE(at + 12);
            if (groups > 100000 || 16 + groups * 12 > len)
                bad('Invalid cmap12 groups');
            let prev = -1;
            for (let i = 0; i < groups; i++) {
                const a = at + 16 + i * 12, s = b.readUInt32BE(a), e = b.readUInt32BE(a + 4);
                if (s <= prev || e < s || e > 0x10ffff)
                    bad('Invalid cmap12 ranges');
                prev = e;
            }
            return (cp: number) => { let lo = 0, hi = groups - 1; while (lo <= hi) {
                const mid = (lo + hi) >> 1, a = at + 16 + mid * 12, s = b.readUInt32BE(a), e = b.readUInt32BE(a + 4);
                if (cp < s)
                    hi = mid - 1;
                else if (cp > e)
                    lo = mid + 1;
                else
                    return b.readUInt32BE(a + 8) + cp - s;
            } return 0; };
        }
        const count = b.readUInt16BE(at + 6) / 2;
        if (!Number.isInteger(count) || !count || 16 + count * 8 > len)
            bad('Invalid cmap4 segments');
        const end = at + 14, start = end + count * 2 + 2, delta = start + count * 2, range = delta + count * 2;
        let prev = -1;
        for (let i = 0; i < count; i++) {
            const s = b.readUInt16BE(start + i * 2), e = b.readUInt16BE(end + i * 2);
            if (s > e || s <= prev)
                bad('Invalid cmap4 range ordering');
            prev = e;
        }
        return (cp: number) => { if (cp > 0xffff)
            return 0; for (let i = 0; i < count; i++) {
            const e = b.readUInt16BE(end + i * 2);
            if (cp > e)
                continue;
            const s = b.readUInt16BE(start + i * 2);
            if (cp < s)
                return 0;
            const d = b.readInt16BE(delta + i * 2), r = b.readUInt16BE(range + i * 2);
            if (!r)
                return (cp + d) & 0xffff;
            const a = range + i * 2 + r + (cp - s) * 2;
            if (a + 2 > at + len)
                bad('Invalid cmap4 glyph extent');
            const g = b.readUInt16BE(a);
            return g ? (g + d) & 0xffff : 0;
        } return 0; };
    });
    return { bytes: Uint8Array.from(b), identity: { id: f.id, family: family!, ...(f.releaseId ? { releaseId: f.releaseId } : {}), weight: f.weight, style: f.style, sha256: f.sha256, licenseSha256: f.license.sha256, embedding: 'full' }, ...(f.legacyAlias ? { legacyAlias: f.legacyAlias } : {}), glyph: cp => { for (const lookup of lookups) {
            const g = lookup(cp);
            if (g > 0 && g < numGlyphs)
                return g;
        } return 0; } };
}
