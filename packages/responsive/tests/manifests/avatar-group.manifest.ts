/**
 * MANIFEST — pdx-avatar-group
 *
 * Contracts DERIVED by inspecting the source and the CSS (they are NOT in universal.ts):
 *   - Source: packages/ui/src/avatar-group/pdx-avatar-group.ts
 *       · render() = html`` (EMPTY). The DOM is built imperatively in ctx.track:
 *         · the HOST <pdx-avatar-group> gets the class `.pdx-avatar-group-root` (display:inline-block).
 *         · a <div class="pdx-avatar-group"> (the INNER box) is created and appended to the host → it is
 *           the flex container (display:flex, flex-direction:row). It is NOT the host.
 *         · every avatar = a <pdx-avatar class="pdx-avatar-group-item"> created with createElement,
 *           with a decreasing `style.zIndex` and `style.marginLeft = overlap+'px'` (overlap<0,
 *           -8 by default) on ALL but the first → they stack over each other.
 *         · the overflow counter (only when items.length > max) = a <div class="pdx-avatar-group-overflow
 *           pdx-avatar-group-item pdx-avatar-size-{size}"> holding "+N", with the same
 *           marginLeft negativo.
 *       · `items` is an Array prop: coercible from a JSON attribute (component.ts coerce → JSON.parse).
 *   - CSS: packages/design/src/components/avatar-group.css
 *       · `.pdx-avatar-group-root .pdx-avatar-group { display:flex; flex-direction:row }`.
 *       · `.pdx-avatar-group-overflow { border-radius:50%; display:inline-flex }` + size map px.
 *
 * SELECTORS: the container's styled class is on the INNER <div>, NOT on the host.
 *   The host only carries `.pdx-avatar-group-root`. The measurable items are the <pdx-avatar> elements
 *   with the class `.pdx-avatar-group-item` (the overlap's marginLeft lives on those hosts).
 *
 * The contracts are CONSERVATIVE but true on all 13 themes: NO exact px.
 *   - overlap: nth(1).left < nth(0).right (the avatars really do overlap) —
 *     a geometric invariant, independent of the theme.
 *   - the +N counter is there when items > max, it is round (radius > 0) and inline-flex.
 *   - NOT interactive by default (clickable=false) → NO keyboard section.
 */
import type { ComponentManifest } from './_types';

// 4 members: with max=3 → 3 visible avatars plus a "+1" counter.
const ITEMS = JSON.stringify([
    { name: 'Ada Lovelace' },
    { name: 'Grace Hopper' },
    { name: 'Alan Turing' },
    { name: 'Edsger Dijkstra' },
]);

export const avatarGroup: ComponentManifest = {
    name: 'avatar-group',
    tag: 'pdx-avatar-group',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/avatar-group'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'avatar-group-stack',
            title: 'Avatar Group — 4 members, max 3 (+1 counter)',
            // items passed as a JSON attribute (an Array prop → coerced with JSON.parse).
            html: `
                <pdx-avatar-group data-test="ag" size="md" max="3" items='${ITEMS}' aria-label="Project team"></pdx-avatar-group>`,
        },
        {
            // Clickable: each avatar and the "+1" are buttons, reachable by Tab, the "+1" named
            // "1 more" — not a pdx-avatar with no role and a <div>, which only a mouse can use.
            id: 'avatar-group-clickable',
            title: 'Avatar Group — clickable, 4 members, max 3',
            html: `
                <pdx-avatar-group data-test="agc" size="md" max="3" clickable items='${ITEMS}' aria-label="Project team"></pdx-avatar-group>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'avatar-group-stack': {
                standalone: [
                    {
                        selector: 'pdx-avatar-group[data-test="ag"] .pdx-avatar-group',
                        description: 'inner container renders as flex',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'pdx-avatar-group[data-test="ag"] .pdx-avatar-group-overflow',
                        description: '+N overflow counter is a flex container',
                        display: { op: 'oneOf', value: ['inline-flex', 'flex'] },
                    },
                    {
                        // border-radius:50% → in px about half the side (md 40px → ~20px). '>=' 12 is the cautious form.
                        selector: 'pdx-avatar-group[data-test="ag"] .pdx-avatar-group-overflow',
                        description: 'overflow counter is circular (large radius)',
                        radius: { all: { op: '>=', value: 12 } },
                    },
                    {
                        selector: 'pdx-avatar-group[data-test="ag"] .pdx-avatar-group-overflow',
                        description: 'overflow counter has positive height',
                        height: { op: '>=', value: 20 },
                    },
                ],
                composition: [
                    {
                        // Stacking: the 2nd avatar starts BEFORE the 1st ends → they overlap.
                        // We measure the .pdx-avatar-group-item hosts (they carry the negative marginLeft).
                        description: 'avatars overlap (second.left < first.right)',
                        parent: 'pdx-avatar-group[data-test="ag"] .pdx-avatar-group',
                        children: {
                            first: '.pdx-avatar-group-item:nth-child(1)',
                            second: '.pdx-avatar-group-item:nth-child(2)',
                        },
                        relations: [
                            { description: 'second.left < first.right', left: 'second.left', op: '<', right: 'first.right' },
                        ],
                    },
                    {
                        // Every visible avatar is on the same line (the same top).
                        description: 'avatars are aligned on the same row',
                        parent: 'pdx-avatar-group[data-test="ag"] .pdx-avatar-group',
                        children: {
                            first: '.pdx-avatar-group-item:nth-child(1)',
                            third: '.pdx-avatar-group-item:nth-child(3)',
                        },
                        relations: [
                            { description: 'first.top == third.top', left: 'first.top', op: '==', right: 'third.top', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        // aria-label on the host; each inner avatar is a role="img" with an aria-label (from its name).
        scenarios: ['avatar-group-stack', 'avatar-group-clickable'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'avatar-group-stack',
        targets: [
            // The +N counter (sized through .pdx-avatar-size-md = 40px) must keep its
            // geometry under hostile global CSS. A 10px tolerance.
            { selector: 'pdx-avatar-group[data-test="ag"] .pdx-avatar-group-overflow', tolerancePx: 10, leaks: [{ issue: 170, properties: ['fontFamily', 'lineHeight', 'letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Clickable: Tab reaches each avatar and the "+1", which says what it counts.
    // Enter and Space firing pdx-click / pdx-overflow-click are unit tests (avatar-a11y.test.ts).
    keyboard: {
        scenario: 'avatar-group-clickable',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="agc"] .pdx-avatar-group-item:nth-child(1)',
              expectAttr: { selector: '[data-test="agc"] .pdx-avatar-group-item:nth-child(1)', name: 'aria-label', value: 'Ada Lovelace' } },
            { key: 'Tab', expectFocus: '[data-test="agc"] .pdx-avatar-group-item:nth-child(2)' },
            { key: 'Tab', expectFocus: '[data-test="agc"] .pdx-avatar-group-item:nth-child(3)' },
            { key: 'Tab', expectFocus: '[data-test="agc"] .pdx-avatar-group-overflow',
              expectAttr: { selector: '[data-test="agc"] .pdx-avatar-group-overflow', name: 'aria-label', value: '1 more' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['avatar-group-stack'],
    },
};

export default avatarGroup;
