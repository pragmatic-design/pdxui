// How pdx-icon draws: the size of a name or a number, the warning for a name its set does not have,
// and the attributes the drawn SVG takes. Pure, beside the component: a .pdx script runs at every
// mount, and these are fixed.

import { DEV, getDefaultIconSet } from '@pdxui/core';

const SIZES: Record<string, number> = { xs: 12, sm: 16, md: 20, lg: 24, xl: 32 };
// Weight map → stroke-width
const WEIGHTS: Record<string, number> = { thin: 1, light: 1.5, regular: 2, bold: 2.5, fill: 0 };

/**
 * A name of the scale, or a number of pixels — what the library's own components pass (`size="48"`
 * in pdx-empty-state, `"15"` in pdx-command); anything else is md (20). A number fell back to md
 * before, and every one of those icons was drawn at 20px.
 */
export function iconSizePx(sizeName: string): number {
    return SIZES[sizeName] ?? (+sizeName > 0 ? +sizeName : 20);
}

/** The `set/name` pairs already warned about: a list of 100 rows with one wrong icon says it once. */
const warnedUnknown = new Set<string>();

/** In development, a name its set does not have, once per name and set (#1017): otherwise it draws nothing, in silence. */
export function warnUnknown(name: string, set: string): void {
    // First, so a production build folds the whole body away.
    if (!DEV) return;
    const setName = set || getDefaultIconSet() || '';
    const key = `${setName}/${name}`;
    if (warnedUnknown.has(key)) return;
    warnedUnknown.add(key);
    console.warn(`[pdx-icon] "${name}" is not an icon of the "${setName}" set, so nothing is drawn.`
        + (setName === 'pragmatic' ? ` The set's names: getPragmaticIconNames() from '@pdxui/ui/icon/pragmatic-icons'.` : ''));
}

/** Size the drawn SVG to its box and give its strokes or fill the current colour and the weight. */
export function applySvgAttrs(el: HTMLElement, sizePx: number, weight: string): void {
    const svg = el.querySelector('svg');
    if (!svg) return;

    // Normalize viewBox and size
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.removeAttribute('width');
    svg.removeAttribute('height');

    // Detect icon type: stroke-based or fill-based
    const hasStroke = svg.querySelector('[stroke]') !== null || svg.getAttribute('stroke') !== null;
    const hasFillNone = svg.getAttribute('fill') === 'none';
    const isStrokeBased = hasStroke || hasFillNone;

    if (isStrokeBased) {
        // Stroke icon (Lucide, Heroicons outline, Tabler, Pragmatic outline)
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('fill', 'none');

        // Weight: explicit prop > CSS variable > optical compensation
        if (weight && WEIGHTS[weight] !== undefined) {
            svg.setAttribute('stroke-width', String(WEIGHTS[weight]));
        } else {
            // Optical size compensation: smaller icons get thicker strokes
            const baseStroke = parseFloat(svg.getAttribute('stroke-width') || '2');
            const opticalFactor = 24 / sizePx; // normalize to 24px reference
            const compensated = Math.min(baseStroke * Math.sqrt(opticalFactor), baseStroke * 1.5);
            svg.setAttribute('stroke-width', String(Math.round(compensated * 100) / 100));
        }
    } else {
        // Fill icon (Material, Heroicons solid)
        svg.setAttribute('fill', 'currentColor');
    }
}
