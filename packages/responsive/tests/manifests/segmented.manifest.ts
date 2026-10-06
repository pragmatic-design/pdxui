/**
 * MANIFEST — pdx-segmented
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/segmented/pdx-segmented.ts
 *      HOST <pdx-segmented> → render:
 *        <div class="pdx-segmented [pdx-segmented-{size}] [pdx-segmented-vertical]"
 *             role="radiogroup" :aria-label="label" :aria-orientation :aria-disabled [full]>
 *          [<input type="hidden">]  // only with a name
 *          <button class="pdx-segmented-item" role="radio" :aria-checked :tabindex :disabled
 *                  data-value=...>label</button> × N
 *        </div>
 *      Radio-group semantics (exactly one selected). JSON-driven options.
 *      A roving tabindex: the active item has tabindex=0, the others -1.
 *      Keyboard: onKeydown custom → ArrowLeft/Right (horizontal) o Up/Down (vertical) +
 *      Home/End, wrapping modulo the count. The selection follows the focus (it emits 'change').
 *      aria-label from the `label` prop. formAssociated.
 *  - CSS: packages/design/src/components/segmented.css
 *      .pdx-segmented → display:inline-flex; position:relative; background:inset;
 *                       border-radius: radius-md; padding:0.15rem; gap:0.15rem.
 *      .pdx-segmented[full] → display:flex; width:100%.
 *      .pdx-segmented-item → padding; border-radius: calc(radius-md - 0.1rem); border:none;
 *                            cursor:pointer; color:muted; background:transparent.
 *      .pdx-segmented-item[aria-checked="true"] → background:surface; color:text; shadow-sm.
 *      .pdx-segmented-item:disabled → opacity: var(--pdx-opacity-disabled); cursor:not-allowed.
 *      .pdx-segmented-indicator → display:none by default (a JS-driven slider) → NOT asserted.
 *      .pdx-segmented-vertical → flex-direction:column.
 *
 * Conservative rules: only invariants true on ALL 13 themes. No exact px.
 * Radius: metro and cyberpunk may zero it → we accept >= 0.
 * The items share a height: a composition '==' with a tolerance (they share the flex row).
 *
 * Accessibility: the group has role="radiogroup" + aria-label (the label prop); every item is
 * role="radio" with aria-checked. No disableRules: the scenario is accessible by design.
 */
import type { ComponentManifest } from './_types';

export const segmented: ComponentManifest = {
    name: 'segmented',
    tag: 'pdx-segmented',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/segmented'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'segmented-basic',
            title: 'Segmented — Basic',
            // label → the aria-label on the radiogroup. value MUST match an option (case-sensitive).
            html: `<pdx-segmented data-test="segmented" label="View mode" value="Week" options='["Day","Week","Month"]'></pdx-segmented>`,
        },
        {
            id: 'segmented-disabled',
            title: 'Segmented — Disabled',
            html: `<pdx-segmented data-test="segmented" label="View mode (disabled)" value="Day" disabled options='["Day","Week","Month"]'></pdx-segmented>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from segmented.css) ──
    contracts: {
        scenarios: {
            'segmented-basic': {
                standalone: [
                    {
                        // .pdx-segmented → display inline-flex (flex with [full]).
                        selector: 'section:not([hidden]) [data-test="segmented"] .pdx-segmented',
                        description: 'segmented container is flex',
                        display: { op: 'oneOf', value: ['inline-flex', 'flex'] },
                    },
                    {
                        // The container's border-radius: metro and cyberpunk may zero it → >= 0.
                        selector: 'section:not([hidden]) [data-test="segmented"] .pdx-segmented',
                        description: 'segmented container radius >= 0',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // .pdx-segmented-item → cursor: pointer (an interactive control).
                        selector: 'section:not([hidden]) [data-test="segmented"] .pdx-segmented-item[aria-checked="true"]',
                        description: 'active item cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // An item that is not disabled → opaque.
                        selector: 'section:not([hidden]) [data-test="segmented"] .pdx-segmented-item[aria-checked="true"]',
                        description: 'active item opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                ],
                composition: [
                    {
                        // The items share the flex row → the same height.
                        description: 'segmented items have consistent height',
                        parent: '[data-test="segmented"] .pdx-segmented',
                        children: {
                            active: '[data-test="segmented"] .pdx-segmented-item[aria-checked="true"]',
                            inactive: '[data-test="segmented"] .pdx-segmented-item[aria-checked="false"]',
                        },
                        relations: [
                            {
                                description: 'active and inactive item same height',
                                left: 'active.height',
                                op: '==',
                                right: 'inactive.height',
                                tolerance: 4,
                            },
                        ],
                    },
                    {
                        // The items must be contained in the group (no vertical overflow).
                        description: 'item contained in group',
                        parent: 'body',
                        children: {
                            group: '[data-test="segmented"] .pdx-segmented',
                            item: '[data-test="segmented"] .pdx-segmented-item[aria-checked="true"]',
                        },
                        relations: [
                            {
                                description: 'item height <= group height',
                                left: 'item.height',
                                op: '<=',
                                right: 'group.height',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'segmented-disabled': {
                // A standalone rule (not a state rule): the host is disabled in the markup and propagates
                // :disabled to the items reactively; we measure the final state after settle (robust to timing).
                standalone: [
                    {
                        // .pdx-segmented-item:disabled → opacity: var(--pdx-opacity-disabled) (≈0.5).
                        selector: 'section:not([hidden]) [data-test="segmented"] .pdx-segmented-item[aria-checked="true"]',
                        description: 'disabled segmented item has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="radiogroup" + aria-label (the label prop); every item is role="radio" + aria-checked. No disableRules.
    a11y: {
        scenarios: ['segmented-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'segmented-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="segmented"] .pdx-segmented', tolerancePx: 10 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA radiogroup → roving) ──
    // A roving tabindex: the active item has tabindex=0. Tab enters the group; the arrows
    // (Arrow plus Home/End) move the focus and the selection, staying inside the group.
    // expectFocusWithin on the group: robust to the timing of the value/checked propagation.
    keyboard: {
        scenario: 'segmented-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="segmented"]' },
            { key: 'ArrowRight', expectFocusWithin: '[data-test="segmented"]' },
            { key: 'ArrowLeft', expectFocusWithin: '[data-test="segmented"]' },
            { key: 'Home', expectFocusWithin: '[data-test="segmented"]' },
            { key: 'End', expectFocusWithin: '[data-test="segmented"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['segmented-basic'],
    },
};

export default segmented;
