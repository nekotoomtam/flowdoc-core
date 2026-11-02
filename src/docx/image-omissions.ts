import type { ResolvedDocument } from './types.js';
import { fail } from './types.js';

/** Opt-in, placement-scoped omission. Unlisted image resources remain mandatory. */
export const DOCX_IMAGE_OMISSIONS_CONTRACT = 'docx-image-omissions/1' as const;
export interface DocxImageOmissions {
    contract: typeof DOCX_IMAGE_OMISSIONS_CONTRACT;
    nodeIds: readonly string[];
}

export function snapshotImageOmissions(document: ResolvedDocument, input: unknown): ReadonlySet<string> {
    const ids = new Set<string>(), path = 'options.imageOmissions';
    if (input === undefined) return ids;
    const value = input as DocxImageOmissions;
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 || Object.keys(value).some(k => !['contract', 'nodeIds'].includes(k)) || value.contract !== 'docx-image-omissions/1' || !Array.isArray(value.nodeIds) || value.nodeIds.length > 10000)
        fail('DOCX_INPUT_INVALID', path, 'Expected a bounded versioned image omission selection');
    let bytes = 0;
    for (const id of value.nodeIds) {
        if (typeof id !== 'string' || !id.trim() || id.length > 2048 || /[\x00-\x1f\x7f]/u.test(id) || ids.has(id) || !Object.hasOwn(document.nodes, id) || document.nodes[id]?.type !== 'image')
            fail('DOCX_INPUT_INVALID', path + '.nodeIds', 'Expected unique existing body image node IDs');
        bytes += Buffer.byteLength(id);
        if (bytes > 8 * 1024 * 1024) fail('DOCX_INPUT_INVALID', path + '.nodeIds', 'Image omission selection exceeds its metadata budget');
        ids.add(id);
    }
    return ids;
}
