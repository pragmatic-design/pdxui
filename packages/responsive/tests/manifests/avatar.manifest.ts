/**
 * MANIFEST — pdx-avatar
 *
 * Contracts DERIVED by inspecting the source and the design tokens (they are NOT in universal.ts):
 *   - Source: packages/ui/src/avatar/pdx-avatar.ts
 *       · the rendered root = <span data-part="root" role="img" :aria-label=alt>, drawn by avatar.css
 *         (#291) from the host's `size` and `shape` variants; only the colour is left inline, as
 *         custom properties. A failed image is the host's :state(broken).
 *       · sizes px: xs=24 sm=32 md=40 lg=48 xl=64. width === height (a square box).
 *       · display:inline-flex; flex-shrink:0; user-select:none.
 *       · shape 'circle' → border-radius:50%; shape 'square' → border-radius:var(--pdx-radius-md).
 *   - Token: packages/design/src/tokens.css → --pdx-radius-md: 0.5rem (= 8px).
 *       · circle: radius = 50% of the side → in px that is large (md 40px → 20px). The '>=' 12 contract is cautious.
 *       · square: radius == var(--pdx-radius-md) ≈ 8px ('>=' 4 is cautious, it varies by theme).
 *
 * Note: light DOM → the styled <span> is a child of the custom element. The selectors point
 *     at its part, `pdx-avatar[data-test="..."] > [data-part="root"]`.
 *
 * The contracts are CONSERVATIVE but true on all 13 themes: no exact px on the radius,
 * only relations (the size hierarchy in a composition) and '>=' on display and shape.
 */
import type { ComponentManifest } from './_types';

export const avatar: ComponentManifest = {
    name: 'avatar',
    tag: 'pdx-avatar',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/avatar'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'avatar-sizes',
            title: 'Avatar — Sizes (xs/sm/md/lg/xl)',
            html: `
                <div class="row" style="display:flex;align-items:center;gap:12px">
                    <pdx-avatar data-test="av-xs" size="xs" alt="Ada Lovelace"></pdx-avatar>
                    <pdx-avatar data-test="av-sm" size="sm" alt="Ada Lovelace"></pdx-avatar>
                    <pdx-avatar data-test="av-md" size="md" alt="Ada Lovelace"></pdx-avatar>
                    <pdx-avatar data-test="av-lg" size="lg" alt="Ada Lovelace"></pdx-avatar>
                    <pdx-avatar data-test="av-xl" size="xl" alt="Ada Lovelace"></pdx-avatar>
                </div>`,
        },
        {
            id: 'avatar-shapes',
            title: 'Avatar — Shapes (circle/square)',
            html: `
                <div class="row" style="display:flex;align-items:center;gap:12px">
                    <pdx-avatar data-test="av-circle" size="lg" shape="circle" alt="Grace Hopper"></pdx-avatar>
                    <pdx-avatar data-test="av-square" size="lg" shape="square" alt="Grace Hopper"></pdx-avatar>
                </div>`,
        },
        {
            // No alt: decorative — aria-hidden, no role; an unnamed role="img" showing "?" would fail
            // axe's role-img-alt. Beside it a named one, the control.
            id: 'avatar-no-alt',
            title: 'Avatar — without a name (decorative)',
            html: `
                <div class="row" style="display:flex;align-items:center;gap:12px">
                    <pdx-avatar data-test="av-anon" size="md"></pdx-avatar>
                    <pdx-avatar data-test="av-named" size="md" alt="Ada Lovelace"></pdx-avatar>
                </div>`,
        },
        {
            // A picture that fails: an empty PNG data URI, refused by the decoder without a request.
            // The host is :state(broken) and the initials show in the picture's place.
            id: 'avatar-broken',
            title: 'Avatar — a picture that fails to load',
            html: `
                <div class="row" style="display:flex;align-items:center;gap:12px">
                    <pdx-avatar data-test="av-broken" size="md" alt="Ada Lovelace" src="data:image/png;base64,"></pdx-avatar>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'avatar-broken': {
                // What a theme selects (#291): the picture failed.
                states: [
                    {
                        description: 'a failed picture is the custom state :state(broken)',
                        selector: 'pdx-avatar[data-test="av-broken"]',
                        trigger: 'attribute',
                        customState: { host: 'pdx-avatar[data-test="av-broken"]', name: 'broken' },
                        changes: {},
                    },
                ],
                standalone: [
                    {
                        selector: 'pdx-avatar[data-test="av-broken"] [data-part="fallback"]',
                        description: 'the initials show in the failed picture\'s place',
                        width: { op: '>', value: 0 },
                    },
                ],
            },
            'avatar-sizes': {
                standalone: [
                    {
                        selector: 'pdx-avatar[data-test="av-md"] > [data-part="root"]',
                        description: 'avatar root renders as inline-flex box',
                        display: { op: 'is', value: 'inline-flex' },
                    },
                    {
                        selector: 'pdx-avatar[data-test="av-md"] > [data-part="root"]',
                        description: 'md avatar is at least 24px tall',
                        height: { op: '>=', value: 24 },
                    },
                ],
                composition: [
                    {
                        // Width == height for every size (a square box), and a rising hierarchy.
                        description: 'size hierarchy: xs < sm < md < lg < xl widths',
                        parent: 'body',
                        children: {
                            xs: 'pdx-avatar[data-test="av-xs"] > [data-part="root"]',
                            sm: 'pdx-avatar[data-test="av-sm"] > [data-part="root"]',
                            md: 'pdx-avatar[data-test="av-md"] > [data-part="root"]',
                            lg: 'pdx-avatar[data-test="av-lg"] > [data-part="root"]',
                            xl: 'pdx-avatar[data-test="av-xl"] > [data-part="root"]',
                        },
                        relations: [
                            { description: 'xs < sm', left: 'xs.width', op: '<', right: 'sm.width' },
                            { description: 'sm < md', left: 'sm.width', op: '<', right: 'md.width' },
                            { description: 'md < lg', left: 'md.width', op: '<', right: 'lg.width' },
                            { description: 'lg < xl', left: 'lg.width', op: '<', right: 'xl.width' },
                        ],
                    },
                    {
                        description: 'avatar is square: width == height (md)',
                        parent: 'body',
                        children: {
                            box: 'pdx-avatar[data-test="av-md"] > [data-part="root"]',
                            box2: 'pdx-avatar[data-test="av-md"] > [data-part="root"]',
                        },
                        relations: [
                            { description: 'width == height', left: 'box.width', op: '==', right: 'box2.height', tolerance: 1 },
                        ],
                    },
                ],
            },
            'avatar-shapes': {
                standalone: [
                    {
                        // circle → border-radius 50% → in px about half the side (lg 48px → ~24px). '>=' 12 is cautious.
                        selector: 'pdx-avatar[data-test="av-circle"] > [data-part="root"]',
                        description: 'circle avatar has large radius (>=12px on lg)',
                        radius: { all: { op: '>=', value: 12 } },
                    },
                    {
                        // square → radius-md, but the radius-zero themes (metro, cyberpunk) zero it:
                        // a sharp "square" avatar is legitimate. The invariant = a non-negative radius;
                        // "the circle is rounder than the square" is in the composition below.
                        selector: 'pdx-avatar[data-test="av-square"] > [data-part="root"]',
                        description: 'square avatar radius is defined (>= 0)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // MeasuredElement exposes the 4 corners; borderTopLeftRadius stands in for the radius.
                        description: 'circle radius >= square radius',
                        parent: 'body',
                        children: {
                            circle: 'pdx-avatar[data-test="av-circle"] > [data-part="root"]',
                            square: 'pdx-avatar[data-test="av-square"] > [data-part="root"]',
                        },
                        relations: [
                            { description: 'circle more rounded than square', left: 'circle.borderTopLeftRadius', op: '>=', right: 'square.borderTopLeftRadius' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // role="img" plus aria-label (from alt) must pass WCAG cleanly.
        scenarios: ['avatar-sizes', 'avatar-no-alt'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'avatar-sizes',
        targets: [
            // The avatar is sized by avatar.css from its `size` (it was an inline width and height
            // before #291): it must keep its square box even under hostile global CSS. An 8px tolerance (a first pass, to be tightened).
            { selector: 'pdx-avatar[data-test="av-md"] > [data-part="root"]', tolerancePx: 8 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // An avatar is NOT interactive (role="img") → no keyboard section.

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['avatar-shapes'],
    },
};

export default avatar;
