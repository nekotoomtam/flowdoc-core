import type { ResolvedDocument } from '../composition/resolvedDocument.js';
import type { Issue, Result } from '../result.js';
export type { ResolvedDocument, Issue, Result };
export interface ResourceFont {
    id: string;
    legacyAlias?: 'regular' | 'bold' | 'italic' | 'boldItalic';
    releaseId?: string;
    weight: number;
    style: 'normal' | 'italic';
    bytes: Uint8Array;
    sha256: string;
    license: {
        bytes: Uint8Array;
        sha256: string;
    };
}
export interface ResourceImage {
    kind?: 'png'|'jpeg';
    width?: number;
    height?: number;
    id: string;
    bytes: Uint8Array;
    sha256: string;
}
export interface ResourceSnapshot {
    fonts: readonly ResourceFont[];
    images: readonly ResourceImage[];
    language?: string;
}
export interface DocxProfile {
    id: 'docx-native-flow/1';
    stage: 'intent-only';
    limits: {
        maxNodes: number;
        maxResourceBytes: number;
        maxImagePixels: number;
    };
}
export interface FontIdentity {
    id: string;
    family: string;
    /** Verified legacy style-linked family for a separately named static weight. */
    nativeFamily?: string;
    releaseId?: string;
    weight: number;
    style: 'normal' | 'italic';
    sha256: string;
    licenseSha256: string;
    embedding: 'full';
}
export interface EffectiveStyle {
    font: FontIdentity;
    sizeHalfPoints: number;
    bold: boolean;
    italic: boolean;
    line: {
        rule: 'atLeast';
        twips: number;
    };
}
export interface NormalizedText {
    nodeId: string;
    path: string;
    scope: string;
    styleId: string;
    text: string;
    sourceToNormalized: readonly number[];
    spans: readonly {
        id: string;
        type: string;
        range: readonly [
            number,
            number
        ];
        target?: string;
        url?: string;
        field?: string;
    }[];
    segments: readonly {
        text: string;
        start: number;
        end: number;
        script: 'Thai' | 'Latin' | 'Common';
    }[];
    language?: string;
}
export interface Preflight {
    kind: 'preflight';
    profileId: string;
    sourceDigest: string;
    resourceIdentities: readonly unknown[];
    rendered: false;
}
export interface ExportIntent {
    kind: 'export-intent';
    sourceDigest: string;
    profileId: string;
    document: Readonly<ResolvedDocument>;
    styles: Readonly<Record<string, EffectiveStyle>>;
    textBlocks: readonly NormalizedText[];
    tables: readonly {
        nodeId: string;
        sourceId?: string;
        scope: string;
        columnTwips: readonly number[];
        cells: readonly {
            nodeId: string;
            paddingTwips: Insets;
        }[];
    }[];
    resourceIdentities: readonly unknown[];
    rendered: false;
    serializationAvailable: false;
}
export class MappingError extends Error {
    constructor(public issue: Issue) { super(issue.message); }
}
export function fail(code: string, path: string, message: string, nodeId?: string): never { throw new MappingError({ code, path, message, ...(nodeId ? { nodeId } : {}) }); }
export function capture<T>(f: () => T): Result<T> { try {
    return { ok: true, value: f(), warnings: [] };
}
catch (e) {
    return { ok: false, issues: [e instanceof MappingError ? e.issue : { code: 'DOCX_INPUT_INVALID', path: 'document', message: e instanceof Error ? e.message : 'Invalid input' }], warnings: [] };
} }
export function freeze<T>(v: T): T { if (v && typeof v === 'object') {
    Object.freeze(v);
    for (const x of Object.values(v))
        if (x && typeof x === 'object' && !Object.isFrozen(x))
            freeze(x);
} return v; }
export type Insets = {
    top: number;
    right: number;
    bottom: number;
    left: number;
};
export function required<T>(value: T | undefined, path: string): T { if (value === undefined)
    fail("DOCX_INPUT_INVALID", path, "Missing validated mapping member"); return value; }
