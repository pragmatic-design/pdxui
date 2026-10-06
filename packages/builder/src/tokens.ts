// The token editor's map of the design system, for a human.
//
// A flat list of 109 `--pdx-*` names is not something anyone edits with intent: you cannot
// tell a spacing step from a radius from a behaviour flag, and `oklch(0.53 0.20 6)` or
// `0.5rem` says nothing about what you will see. So tokens are grouped by what they DO, and
// each row shows the value the browser actually resolves it to.

export type TokenKind = 'color' | 'length' | 'font' | 'shadow' | 'number' | 'text';

export interface TokenDef {
    /** Full custom property, e.g. `--pdx-color-primary`. */
    name: string;
    /** Short label for the row — the prefix is the group, repeating it is noise. */
    label: string;
    kind: TokenKind;
}

export interface TokenGroup {
    id: string;
    label: string;
    /** One line on what this group controls, and when to touch it. */
    hint: string;
    tokens: TokenDef[];
}

const color = (name: string, label: string): TokenDef => ({ name: `--pdx-color-${name}`, label, kind: 'color' });
const len = (prefix: string) => (name: string, label: string): TokenDef =>
    ({ name: `--pdx-${prefix}-${name}`, label, kind: 'length' });
const space = len('space');
const radius = len('radius');
const text = len('text');

export const TOKEN_GROUPS: TokenGroup[] = [
    {
        id: 'surfaces',
        label: 'Surfaces & text',
        hint: 'The page itself: what sits behind everything, and what reads on top of it.',
        tokens: [
            color('bg', 'page background'),
            color('surface', 'raised surface'),
            color('inset', 'sunken surface'),
            color('overlay', 'overlay / scrim'),
            color('text', 'body text'),
            color('muted', 'secondary text'),
            color('border', 'border'),
            color('border-strong', 'border (strong)'),
        ],
    },
    {
        id: 'brand',
        label: 'Brand & interaction',
        hint: 'The colours that carry the identity. A -text token is the LABEL on that fill.',
        tokens: [
            color('primary', 'primary fill'),
            color('primary-hover', 'primary hover'),
            color('primary-text', 'label on primary'),
            color('accent', 'accent'),
            color('focus', 'focus ring'),
        ],
    },
    {
        id: 'semantic',
        label: 'Status colours',
        hint: 'Danger / success / warning / info. Each fill has its own label colour.',
        tokens: [
            color('danger', 'danger fill'),
            color('danger-text', 'label on danger'),
            color('success', 'success fill'),
            color('success-text', 'label on success'),
            color('warning', 'warning fill'),
            color('warning-text', 'label on warning'),
            color('info', 'info fill'),
            color('info-text', 'label on info'),
        ],
    },
    {
        id: 'space',
        label: 'Spacing',
        hint: 'One scale, used for every gap and padding. Changing a step moves the whole UI.',
        tokens: [
            space('2xs', '2xs'), space('xs', 'xs'), space('sm', 'sm'), space('md', 'md'),
            space('lg', 'lg'), space('xl', 'xl'), space('2xl', '2xl'), space('3xl', '3xl'),
        ],
    },
    {
        id: 'radius',
        label: 'Corner radius',
        hint: 'How round everything is. Buttons have their own override below.',
        tokens: [
            radius('sm', 'sm'), radius('md', 'md'), radius('lg', 'lg'),
            radius('xl', 'xl'), radius('full', 'full (pill)'),
        ],
    },
    {
        id: 'type',
        label: 'Typography',
        hint: 'Families and the size ramp. `base` is the body size everything else scales from.',
        tokens: [
            { name: '--pdx-font-sans', label: 'sans family', kind: 'font' },
            { name: '--pdx-font-heading', label: 'heading family', kind: 'font' },
            { name: '--pdx-font-mono', label: 'mono family', kind: 'font' },
            text('xs', 'xs'), text('sm', 'sm'), text('base', 'base'), text('lg', 'lg'),
            text('xl', 'xl'), text('2xl', '2xl'), text('3xl', '3xl'),
            { name: '--pdx-weight-medium', label: 'weight medium', kind: 'number' },
            { name: '--pdx-weight-semibold', label: 'weight semibold', kind: 'number' },
        ],
    },
    {
        id: 'elevation',
        label: 'Elevation',
        hint: 'Shadow ramp. `shadow-color` tints the whole set at once.',
        tokens: [
            { name: '--pdx-shadow-color', label: 'shadow tint', kind: 'text' },
            { name: '--pdx-shadow-sm', label: 'sm', kind: 'shadow' },
            { name: '--pdx-shadow-md', label: 'md', kind: 'shadow' },
            { name: '--pdx-shadow-lg', label: 'lg', kind: 'shadow' },
            { name: '--pdx-shadow-xl', label: 'xl', kind: 'shadow' },
        ],
    },
    {
        id: 'behaviour',
        label: 'Component behaviour',
        hint: 'Structural choices the archetype makes. These change shape, not colour.',
        tokens: [
            { name: '--pdx-button-radius', label: 'button radius', kind: 'length' },
            { name: '--pdx-button-min-height', label: 'button height', kind: 'length' },
            { name: '--pdx-input-min-height', label: 'input height', kind: 'length' },
            { name: '--pdx-input-style', label: 'input style', kind: 'text' },
            { name: '--pdx-tab-indicator', label: 'tab indicator', kind: 'text' },
            { name: '--pdx-tab-indicator-size', label: 'tab indicator size', kind: 'length' },
            { name: '--pdx-card-style', label: 'card style', kind: 'text' },
            { name: '--pdx-accordion-glyph', label: 'accordion glyph', kind: 'text' },
            { name: '--pdx-breadcrumb-separator', label: 'breadcrumb separator', kind: 'text' },
            { name: '--pdx-border-width', label: 'border width', kind: 'length' },
            { name: '--pdx-opacity-disabled', label: 'disabled opacity', kind: 'number' },
        ],
    },
    {
        id: 'ramps',
        label: 'Colour ramps',
        hint: 'Derived shades. Usually left alone — edit the brand or the semantic colour instead.',
        tokens: [
            ...['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']
                .map(s => ({ name: `--pdx-gray-${s}`, label: `gray ${s}`, kind: 'color' as const })),
            ...['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
                .map(s => ({ name: `--pdx-primary-${s}`, label: `primary ${s}`, kind: 'color' as const })),
        ],
    },
];

/** Flat list, for anything that just needs the names. */
export const ALL_EDITABLE_TOKENS = TOKEN_GROUPS.flatMap(g => g.tokens.map(t => t.name));

const PROBE_ID = 'pdx-builder-token-probe';

/**
 * What the browser actually resolves each token to, read from the PREVIEW document.
 *
 * `getComputedStyle(el).getPropertyValue('--pdx-space-md')` gives back the declared text
 * (`1rem`), which is the thing the human already typed. To show what it MEANS the value has
 * to be used: assigned to a real property on a probe element, then read back computed —
 * `1rem` becomes `16px`, a `light-dark()` colour collapses to the branch in force.
 */
export function resolveTokens(doc: Document, defs: TokenDef[]): Record<string, string> {
    const out: Record<string, string> = {};
    if (!doc?.body) return out;

    let probe = doc.getElementById(PROBE_ID) as HTMLElement | null;
    if (!probe) {
        probe = doc.createElement('div');
        probe.id = PROBE_ID;
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px';
        doc.body.appendChild(probe);
    }
    const view = doc.defaultView;
    if (!view) return out;

    for (const def of defs) {
        const value = `var(${def.name})`;
        probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:-9999px';
        try {
            if (def.kind === 'color') {
                probe.style.color = value;
                out[def.name] = view.getComputedStyle(probe).color;
            } else if (def.kind === 'length') {
                probe.style.width = value;
                out[def.name] = view.getComputedStyle(probe).width;
            } else if (def.kind === 'font') {
                probe.style.fontFamily = value;
                out[def.name] = view.getComputedStyle(probe).fontFamily;
            } else if (def.kind === 'shadow') {
                probe.style.boxShadow = value;
                out[def.name] = view.getComputedStyle(probe).boxShadow;
            } else {
                // Numbers and free text have no property that would resolve them further,
                // so the declared value IS the resolved one.
                out[def.name] = view.getComputedStyle(doc.documentElement).getPropertyValue(def.name).trim();
            }
        } catch {
            out[def.name] = '';
        }
    }
    return out;
}
