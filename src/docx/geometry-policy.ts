import { required } from './types.js';
/** Native representation decisions only; never mutate source geometry. */
export type TableSpaceInput = {
    unmergedPlainGrid: boolean;
    uniformSingleHalfPointBorder: boolean;
    sourceTopPt: number;
    sourceBottomPt: number;
    sourceTopTwips: number;
    sourceBottomTwips: number;
};
export type TableSpaceDecision = {
    policy: 'border-centre-inset' | 'retain-native';
    nativeTopTwips: number;
    nativeBottomTwips: number;
    reason: string;
};
export function deriveTableSpace(input: TableSpaceInput): TableSpaceDecision {
    const reason = !input.unmergedPlainGrid ? 'unverified-grid-or-content' : !input.uniformSingleHalfPointBorder ? 'unverified-border' : input.sourceTopPt !== 4 || input.sourceBottomPt !== 4 || input.sourceTopTwips !== 80 || input.sourceBottomTwips !== 80 ? 'unverified-vertical-padding' : 'bounded-half-stroke-inset';
    const eligible = reason === 'bounded-half-stroke-inset';
    return { policy: eligible ? 'border-centre-inset' : 'retain-native', nativeTopTwips: input.sourceTopTwips - (eligible ? 5 : 0), nativeBottomTwips: input.sourceBottomTwips - (eligible ? 5 : 0), reason };
}
export type HeaderSpaceInput = {
    effectiveFirstEmpty: boolean;
    effectiveDefaultEmpty: boolean;
    previousDistanceTwips: number;
};
export type HeaderSpaceDecision = {
    policy: 'empty-header-zero' | 'retain-h3';
    nativeDistanceTwips: number;
    reason: string;
};
export function deriveHeaderSpace(input: HeaderSpaceInput): HeaderSpaceDecision {
    const empty = input.effectiveFirstEmpty && input.effectiveDefaultEmpty;
    return { policy: empty ? 'empty-header-zero' : 'retain-h3', nativeDistanceTwips: empty ? 0 : input.previousDistanceTwips, reason: empty ? 'both-effective-headers-empty' : input.effectiveFirstEmpty || input.effectiveDefaultEmpty ? 'mixed-header-visibility' : 'visible-header-h3' };
}
