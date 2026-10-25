import { JpegCheck } from '../pdf/streamResources.js';
import { required } from './types.js';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fail, type ResourceSnapshot, type DocxProfile, type FontIdentity } from './types.js';
import { parseFont, type ParsedFont } from './fonts.js';
const PNG = createRequire(import.meta.url)('pngjs').PNG;
export const hash = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
export interface PrivateResources {
    fonts: ParsedFont[];
    images: Map<string, {
        id: string;
        sha256: string;
        width: number;
        height: number;
        rgbaSha256?: string;
        kind: 'png' | 'jpeg';
        bytes: Uint8Array;
    }>;
    identities: unknown[];
    language?: string;
}
export function snapshotResources(input: ResourceSnapshot, profile: DocxProfile): PrivateResources {
    if (!input || !Array.isArray(input.fonts) || !Array.isArray(input.images) || Object.keys(input).some(k => !['fonts', 'images', 'language'].includes(k)))
        fail('DOCX_RESOURCE_INVALID', 'resources', 'Expected explicit font/image resource arrays');
    if (input.language !== undefined && (typeof input.language !== 'string' || !/^[a-zA-Z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(input.language)))
        fail('DOCX_RESOURCE_INVALID', 'resources.language', 'Invalid explicit language context');
    let total = 0;
    const copy = (bytes: Uint8Array, expected: string, path: string) => {
        if (!(bytes instanceof Uint8Array) || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
            fail('DOCX_RESOURCE_INVALID', path, 'Expected immutable-byte identity');
        total += bytes.length;
        if (total > profile.limits.maxResourceBytes)
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', path, 'U1 resource byte budget exceeded');
        const out = Uint8Array.from(bytes);
        if (hash(out) !== expected)
            fail('DOCX_RESOURCE_INVALID', path, 'Resource SHA256 mismatch');
        return out;
    };
    const fonts: ParsedFont[] = [], ids = new Set<string>(), images = new Map(), identities: unknown[] = [];
    for (const [i, original] of input.fonts.entries()) {
        const p = `resources.fonts.${i}`;
        if (!original || typeof original.id !== 'string' || !original.id || ids.has(original.id) || original.releaseId !== undefined && (typeof original.releaseId !== 'string' || !original.releaseId) || !Number.isInteger(original.weight) || original.weight < 1 || original.weight > 1000 || !['normal', 'italic'].includes(original.style) || Object.keys(original).some(k => !['id', 'legacyAlias', 'releaseId', 'weight', 'style', 'bytes', 'sha256', 'license'].includes(k)) || ![undefined, 'regular', 'bold', 'italic', 'boldItalic'].includes(original.legacyAlias) || !original.license || Object.keys(original.license).some(k => !['bytes', 'sha256'].includes(k)))
            fail('DOCX_RESOURCE_INVALID', p, 'Missing/duplicate font identity, unknown field or unapproved embedding license');
        ids.add(original.id);
        const bytes = copy(original.bytes, original.sha256, p + '.bytes'), license = copy(original.license.bytes, original.license.sha256, p + '.license');
        if (!new TextDecoder('utf-8', { fatal: true }).decode(license).trim())
            fail('DOCX_RESOURCE_INVALID', p + '.license', 'Empty license evidence');
        const f = parseFont({ ...original, bytes, license: { ...original.license, bytes: license } }, p);
        fonts.push(f);
        identities.push(f.identity);
    }
    for (const [i, original] of input.images.entries()) {
        const p = `resources.images.${i}`;
        if (!original || typeof original.id !== 'string' || !original.id || images.has(original.id) || Object.keys(original).some(k => !['id', 'bytes', 'sha256', 'kind', 'width', 'height'].includes(k)))
            fail('DOCX_RESOURCE_INVALID', p, 'Missing/duplicate image identity or unknown field');
        const bytes = Buffer.from(copy(original.bytes, original.sha256, p + '.bytes'));
        if (original.kind === 'jpeg') {
            const { width, height } = original;
            if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || !width || !height || width < 1 || height < 1 || width * height > profile.limits.maxImagePixels)
                fail('DOCX_RESOURCE_INVALID', p, 'Invalid JPEG dimensions');
            try {
                const check = new JpegCheck(width, height);
                check.push(bytes);
                check.finish();
            }
            catch {
                fail('DOCX_RESOURCE_INVALID', p, 'Malformed JPEG resource');
            }
            const meta = { id: original.id, sha256: original.sha256, width, height, kind: 'jpeg' as const };
            images.set(original.id, { ...meta, bytes: Uint8Array.from(bytes) });
            identities.push(meta);
            continue;
        }
        if (original.kind !== undefined && original.kind !== 'png')
            fail('DOCX_RESOURCE_INVALID', p, 'Invalid image encoding');
        if (bytes.length < 33 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR')
            fail('DOCX_RESOURCE_INVALID', p, 'U1 requires prepared PNG resources');
        const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
        if (!w || !h || w * h > profile.limits.maxImagePixels)
            fail('DOCX_OUTPUT_BUDGET_EXCEEDED', p, 'Decoded image pixel budget exceeded');
        let decoded: any;
        try {
            decoded = PNG.sync.read(bytes, { checkCRC: true });
        }
        catch {
            fail('DOCX_RESOURCE_INVALID', p, 'Malformed PNG resource');
        }
        const meta = { id: original.id, sha256: original.sha256, width: decoded.width, height: decoded.height, rgbaSha256: hash(decoded.data), kind: 'png' as const };
        images.set(original.id, { ...meta, bytes: Uint8Array.from(bytes) });
        identities.push(meta);
    }
    return { fonts, images, identities, ...(input.language ? { language: input.language } : {}) };
}
