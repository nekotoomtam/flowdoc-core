import { required } from './types.js';
/** H1/H2 structural envelope only. Existing concrete-font no-wrap/fit guards still apply. */
export function headerSpaceEligibility(band: any): {
    eligible: boolean;
    shape?: string;
    reason?: string;
} {
    if (band.placement)
        return { eligible: false, reason: 'explicit-placement-not-word-verified' };
    const nodes = band.nodes, roots = band.rootIds.map((id: string) => nodes[id]);
    const text = (n: any) => n?.type === 'text-block' && n.props.heightMode !== 'fixed' && !n.props.toc && !n.props.anchorId && n.children.length > 0 && n.children.every((c: any) => c.type === 'text' && !/[\n\r\t]/.test(c.text));
    if (roots.length >= 1 && roots.length <= 3 && roots.every(text))
        return { eligible: true, shape: 'authored-paragraph-stack' };
    if (roots.length === 2 && roots[0].type === 'image' && text(roots[1])) {
        const points = (v: any) => v.value * (v.unit === 'mm' ? 72 / 25.4 : 1);
        if (points(roots[0].props.width) <= 42 && points(roots[0].props.height) <= 42)
            return { eligible: true, shape: 'png-then-caption' };
    }
    if (roots.length === 1 && roots[0].type === 'columns') {
        const c = roots[0];
        if (c.columns.length === 2 && c.columns[0].weight === c.columns[1].weight && c.columns.every((col: any) => col.childIds.length === 2 && col.childIds.every((id: string) => text(nodes[id]))))
            return { eligible: true, shape: 'two-equal-text-columns' };
    }
    return { eligible: false, reason: 'unverified-header-shape' };
}
