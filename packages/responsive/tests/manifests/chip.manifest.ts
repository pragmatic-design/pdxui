/**
 * MANIFEST — pdx-chip
 *
 * Contracts derived by inspecting:
 *  - source: packages/ui/src/chip/pdx-chip.ts
 *      render → <span class="pdx-chip ..."><span class="pdx-chip-body">…</span>[<button class="pdx-chip-remove">]</span>
 *        only the interactive parts are tab stops:
 *        - a plain chip → no role, no tabindex, no ARIA
 *        - selectable → role="button" + aria-pressed + tabindex="0" on the pill; Enter and Space press it
 *        - removable → the only tab stop is the ×, aria-label="Remove {label}", `disabled` when the chip is
 *        - selectable + removable → the toggle is .pdx-chip-body and the × is its sibling: no button inside a button
 *  - CSS: packages/design/src/components/chip.css
 *      .pdx-chip → display: inline-flex; border-radius: var(--pdx-radius-full); cursor: pointer;
 *                  border: var(--pdx-border-width) solid var(--pdx-color-border);
 *      .pdx-chip.disabled → opacity: var(--pdx-opacity-disabled) (< 1); cursor: not-allowed; pointer-events: none;
 *      .pdx-chip-remove → cursor: pointer; opacity: 0.6 (→ 1 on hover).
 *
 * Conservative rules: only invariants true on ALL 13 themes. No exact px value.
 */
import type { ComponentManifest } from './_types';

export const chip: ComponentManifest = {
    name: 'chip',
    tag: 'pdx-chip',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/chip'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'chip-variants',
            title: 'Chip — Variants',
            html: `
                <div class="row">
                    <pdx-chip data-test="default" label="Default"></pdx-chip>
                    <pdx-chip data-test="primary" label="Primary" variant="primary"></pdx-chip>
                    <pdx-chip data-test="removable" label="Removable" removable></pdx-chip>
                    <pdx-chip data-test="selectable" label="Selectable" selectable></pdx-chip>
                </div>`,
        },
        {
            id: 'chip-disabled',
            title: 'Chip — Disabled',
            html: `<pdx-chip data-test="disabled" label="Disabled" disabled></pdx-chip>`,
        },
        {
            // Selectable and removable: the toggle and the × are siblings, not a <button> inside a
            // role="button" (axe nested-interactive).
            id: 'chip-selectable-removable',
            title: 'Chip — Selectable and removable',
            html: `<pdx-chip data-test="sr" label="Tech" value="tech" selectable removable></pdx-chip>`,
        },
        {
            // The colour as text: on the page (outline) and on its own tint (tonal).
            id: 'chip-text-colours',
            title: 'Chip — Outline and tonal colours',
            html: `
                <div class="row">
                    ${['primary', 'success', 'danger', 'warning', 'info'].map((v) =>
                        `<pdx-chip data-test="c-${v}" label="${v}" variant="${v}"></pdx-chip>`).join('\n                    ')}
                    ${['primary', 'success', 'danger', 'warning'].map((v) =>
                        `<pdx-chip data-test="t-${v}" label="tonal ${v}" variant="tonal-${v}"></pdx-chip>`).join('\n                    ')}
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from chip.css) ──
    contracts: {
        scenarios: {
            'chip-variants': {
                standalone: [
                    {
                        // .pdx-chip → display: inline-flex
                        selector: '[data-test="default"] .pdx-chip',
                        description: 'chip is inline-flex',
                        display: { op: 'is', value: 'inline-flex' },
                    },
                    {
                        // An atom: a cautious minimum.
                        selector: '[data-test="default"] .pdx-chip',
                        description: 'chip height >= 18px',
                        height: { op: '>=', value: 18 },
                    },
                    {
                        // .pdx-chip → cursor: pointer (interactive).
                        selector: '[data-test="default"] .pdx-chip',
                        description: 'chip cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // A default, unselected chip: opaque.
                        selector: '[data-test="default"] .pdx-chip',
                        description: 'chip opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // border-radius: var(--pdx-radius-full) → a pill on every theme.
                        selector: '[data-test="default"] .pdx-chip',
                        description: 'chip has rounded corners (radius >= 2px)',
                        radius: { all: { op: '>=', value: 2 } },
                    },
                    {
                        // .pdx-chip-remove exists only with removable (and !disabled) → it has cursor pointer.
                        selector: '[data-test="removable"] .pdx-chip-remove',
                        description: 'remove button cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        // The remove button must sit INSIDE the chip.
                        description: 'remove button contained in chip',
                        parent: 'body',
                        children: {
                            chip: '[data-test="removable"] .pdx-chip',
                            remove: '[data-test="removable"] .pdx-chip-remove',
                        },
                        relations: [
                            {
                                description: 'remove button height <= chip height',
                                left: 'remove.height',
                                op: '<=',
                                right: 'chip.height',
                            },
                        ],
                    },
                ],
            },
            'chip-disabled': {
                states: [
                    {
                        // .pdx-chip.disabled → opacity: var(--pdx-opacity-disabled) (< 1).
                        description: 'disabled chip has reduced opacity',
                        selector: '[data-test="disabled"] .pdx-chip',
                        trigger: 'attribute',
                        attribute: { name: 'disabled', value: '' },
                        changes: { opacity: { op: '<', value: 1 } },
                    },
                ],
            },
            // The fill colour as text, on the page or on its tint, measures 1.5–4.4 in all
            // 26 theme×scheme combinations: the text takes the -ink colour. Unselected, as a chip first appears.
            'chip-text-colours': {
                standalone: [
                    ...['primary', 'success', 'danger', 'warning', 'info'].map((v) => ({
                        selector: `[data-test="c-${v}"] .pdx-chip`,
                        description: `${v} chip text is legible on the page (AA)`,
                        contrast: { op: '>=' as const, value: 4.5 },
                    })),
                    ...['primary', 'success', 'danger', 'warning'].map((v) => ({
                        selector: `[data-test="t-${v}"] .pdx-chip`,
                        description: `tonal ${v} chip text is legible on its tint (AA)`,
                        contrast: { op: '>=' as const, value: 4.5 },
                    })),
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    a11y: {
        scenarios: ['chip-variants', 'chip-disabled', 'chip-selectable-removable'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'chip-variants',
        targets: [
            // A box-sizing defence in chip.css; the residue comes from a pathological host on a tiny atom.
            { selector: '[data-test="default"] .pdx-chip', tolerancePx: 14 },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // Only the interactive parts are tab stops: plain chips are skipped, the first Tab
    // reaches the removable one's ×, the second the selectable chip, which Space presses.
    keyboard: {
        scenario: 'chip-variants',
        steps: [
            { key: 'Tab', expectFocus: '[data-test="removable"] .pdx-chip-remove' },
            { key: 'Tab', expectFocus: '[data-test="selectable"] .pdx-chip' },
            { key: 'Space', expectAttr: { selector: '[data-test="selectable"] .pdx-chip', name: 'aria-pressed', value: 'true' } },
            { key: 'Enter', expectAttr: { selector: '[data-test="selectable"] .pdx-chip', name: 'aria-pressed', value: 'false' } },
        ],
    },

    // ── Dim. 5: visual regression ──
    visual: {
        scenarios: ['chip-variants'],
    },
};

export default chip;
