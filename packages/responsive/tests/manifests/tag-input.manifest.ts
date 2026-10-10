/**
 * MANIFEST — pdx-tag-input
 *
 * NEW contracts, derived by inspecting:
 *  - source: packages/ui/src/tag-input/pdx-tag-input.ts
 *      the HOST <pdx-tag-input> (CSS host: display:block) → render: an inner
 *        <div class="pdx-tag-input pdx-input-wrap [pdx-input-{size}] [disabled|readonly|error|success|warning]"
 *             role="group" :aria-label="label || 'Tag input'" @click=onWrapClick>
 *          <span class="pdx-chip pdx-chip-sm">
 *            <span>{tag}</span>
 *            [<button class="pdx-chip-remove" aria-label="Remove {tag}">×</button>]  // when !disabled && !readonly
 *          </span> × tags
 *          [<input class="pdx-tag-input-field" type="text" :aria-label="label || 'Add tag'"
 *                  :disabled :readonly @input @keydown @paste>]  // when !disabled && !readonly && !atLimit
 *          [<input type="hidden">]  // when name
 *      The styled class .pdx-tag-input.pdx-input-wrap is on the INNER div, NOT on the host.
 *      Scope to "... .pdx-input-wrap" (it reuses the design system's input wrapper).
 *      aria-label IS forwarded to the inner input (label || 'Add tag') → NO a11y bug.
 *      Keyboard: Enter/Tab/separator commit, Backspace removes the last one, Escape clears.
 *      The focus enters the input field with Tab.
 *  - CSS: packages/design/src/components/tag-input.css
 *      .pdx-tag-input → flex-wrap: wrap; gap: 4px; min-height: calc(--pdx-input-height(2.5rem) - 2px) ≈ 38px;
 *                       cursor: text. (it inherits .pdx-input-wrap: border, radius, focus, display:flex)
 *      .pdx-tag-input-field → flex:1; min-width:60px; border:none; outline:none; background:transparent.
 *      .pdx-tag-input.disabled → opacity: var(--pdx-opacity-disabled) (< 1); pointer-events: none.
 *      @media (pointer: coarse) → min-height: 44px (mobile touch target).
 *
 * a11y: container role="group" + aria-label (a token field is NOT a listbox: a listbox admits
 * only role=option children, never an <input>, and remove buttons inside an option would give
 * nested-interactive). The remove button has aria-label="Remove {tag}". The scenario passes an
 * explicit label. No disableRules.
 *
 * Conservative rules: NO exact px. It is content-driven (it grows with the tags) → isolation skipHeight,
 * and the wrapper height >= 28 (not 32). display oneOf flex.
 */
import type { ComponentManifest } from './_types';

export const tagInput: ComponentManifest = {
    name: 'tag-input',
    tag: 'pdx-tag-input',
    tier: '3A',
    status: 'wip',
    imports: ['@pdxui/ui/tag-input'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'tag-input-basic',
            title: 'Tag Input — Basic',
            // label → aria-label on the group container + input field. A `value` preseeded with 2 tags (chips).
            html: `<pdx-tag-input data-test="tag-input" label="Skills" placeholder="Add a skill..." value='["react","vue"]'></pdx-tag-input>`,
        },
        {
            id: 'tag-input-disabled',
            title: 'Tag Input — Disabled',
            html: `<pdx-tag-input data-test="tag-input" label="Skills (disabled)" value='["react","vue"]' disabled></pdx-tag-input>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from tag-input.css) ──
    contracts: {
        scenarios: {
            'tag-input-basic': {
                standalone: [
                    {
                        // .pdx-input-wrap → display: flex (the wrapper is flex; .pdx-tag-input adds wrap).
                        selector: 'section:not([hidden]) [data-test="tag-input"] .pdx-input-wrap',
                        description: 'tag-input wrapper is flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // min-height calc(2.5rem - 2px) ≈ 38px; a conservative threshold aligned with input (>=28).
                        selector: 'section:not([hidden]) [data-test="tag-input"] .pdx-input-wrap',
                        description: 'tag-input wrapper height >= 28px',
                        height: { op: '>=', value: 28 },
                    },
                    {
                        // .pdx-tag-input → cursor: text (clicking the wrapper focuses the input).
                        selector: 'section:not([hidden]) [data-test="tag-input"] .pdx-input-wrap',
                        description: 'tag-input wrapper cursor = text',
                        cursor: { op: 'is', value: 'text' },
                    },
                    {
                        // Not disabled → opaque.
                        selector: 'section:not([hidden]) [data-test="tag-input"] .pdx-input-wrap',
                        description: 'tag-input wrapper opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // The inner input has no border of its own (the wrapper provides it).
                        selector: 'section:not([hidden]) [data-test="tag-input"] input.pdx-tag-input-field',
                        description: 'inner field has no visible own border',
                        border: {
                            top: { style: { op: 'is', value: 'none' } },
                            left: { style: { op: 'is', value: 'none' } },
                            right: { style: { op: 'is', value: 'none' } },
                        },
                    },
                ],
                composition: [
                    {
                        // The tags (chips) must sit INSIDE the wrapper (no vertical overflow).
                        description: 'tag chip contained in wrapper',
                        parent: 'body',
                        children: {
                            wrap: '[data-test="tag-input"] .pdx-input-wrap',
                            chip: '[data-test="tag-input"] .pdx-chip',
                        },
                        relations: [
                            {
                                description: 'chip height <= wrapper height',
                                left: 'chip.height',
                                op: '<=',
                                right: 'wrap.height',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            'tag-input-disabled': {
                // The state is already in the markup → standalone (no StateRule: the reactive .disabled class would flake).
                standalone: [
                    {
                        // .pdx-tag-input.disabled → opacity: var(--pdx-opacity-disabled) (< 1).
                        selector: 'section:not([hidden]) [data-test="tag-input"] .pdx-input-wrap',
                        description: 'disabled tag-input has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="group" + aria-label (the label prop), chips with no role (a token field, not a listbox),
    // the input field's aria-label forwarded, the remove button aria-label="Remove {tag}". No disableRules.
    a11y: {
        scenarios: ['tag-input-basic', 'tag-input-disabled'],
    },

    // ── Dim. 3: style isolation ──
    // A content-driven container (height = the chip wrap + the input, growing with the tags) → skipHeight.
    // The radius (a CSS value, not scaled) stays asserted.
    isolation: {
        scenario: 'tag-input-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="tag-input"] .pdx-input-wrap', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }, { issue: 170, properties: ['borderTopColor'], themes: ['material'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // It is an input: Tab brings the focus onto the inner text field. The key handling
    // (Enter/Backspace/Escape/separator) is custom; here we only certify that the focus enters.
    keyboard: {
        scenario: 'tag-input-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="tag-input"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['tag-input-basic'],
    },
};

export default tagInput;
