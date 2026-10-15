/**
 * MANIFEST — pdx-filter-builder
 *
 * A "Notion-style" filter builder: a BAR of chips. Every active filter is a chip
 * (`.pdx-fb-chip`, with a `.pdx-fb-chip-label` label and a `.pdx-fb-chip-remove` button);
 * at the end there is always a `.pdx-fb-add-btn` button ("+ Add Filter") and, only with at least one filter, a
 * `.pdx-fb-clear-btn` ("Clear all"). The condition editor (field-select / operator / value) is NOT
 * inline in the component: it is a POPOVER (`.pdx-fb-popover` with `.pdx-fb-field-item`) created in
 * `document.body` when Add or a chip is clicked. So there are NO "AND/OR groups with rule rows of
 * field-select+operator+value-input" in the component's DOM: the real DOM is the chip bar plus a
 * transient popover.
 *
 * Source inspected: packages/ui/src/filter-builder/pdx-filter-builder.ts
 * CSS:                  packages/design/src/components/filter-builder.css
 *
 * ── DETERMINISM: why the certified scenario is the EMPTY STATE (the Add button alone) ──
 *
 * The rendering (ctx.track + rAF, lines 217-230) builds `_barEl` (`.pdx-filter-builder`) only
 * when `fields`/`source` are read, and then `rebuildChips()` (157-213) draws the chips from the internal
 * `_filters` SIGNAL — NEVER from the prop. The `value` prop (line 29) is DECLARED but NEVER READ, and so is
 * the `logic` prop (line 30): there is no `_filters.set(value)` at init. `_filters` is filled
 * ONLY through the `setFilter`/`removeFilter`/`clearAll` closures, which are not exposed (`return {}`, line 232 —
 * no `ctx.expose`). So adding a chip would take: a click on Add → a popover in the body →
 * a click on a field item → a second condition popover → Apply. An interactive, asynchronous chain that
 * depends on the floating positioning: NOT deterministic and NOT expressible from markup or a property.
 *
 * The state that is 100% deterministic and stable across operating systems and themes is therefore the EMPTY BAR:
 *   _filters = [] → rebuildChips() skips the chip loop, ALWAYS appends `.pdx-fb-add-btn`, and does NOT
 *   append the clear button (`filters.length > 0` is false). That exercises the `.pdx-filter-builder`
 *   wrapper (a flex row that wraps) and the Add button (whose accessible name is the text "+ Add
 *   Filter"). It is the same compromise field-list.manifest.ts made (the certified empty state).
 *
 * `fields` is an array of FieldDefinitions (JS objects): NOT settable from a static HTML attribute
 * → it is set as a PROPERTY in a per-scenario `setup`. The setup (generate.ts:78) runs as
 * `async function () { <setup> }` AFTER the custom elements upgrade and the first render, before `data-pdx-ready`
 * → a BARE `await` is used to wait for the rAF in which `_barEl` is created (no IIFE). A non-empty
 * `fields` is set, so `getAvailableFields()` has items and the Add button stays meaningful.
 *
 * ── CLASSES VERIFIED (source + filter-builder.css) ──
 *   pdx-filter-builder (host)  → display:block (css:3) — gets data-test
 *   .pdx-filter-builder        → display:flex; flex-wrap:wrap; gap; align-items:center (bar, css:5 / source:225)
 *   .pdx-fb-add-btn            → inline-flex; border 1px dashed; radius-full; cursor:pointer (css:59 / source:198)
 *   .pdx-fb-chip               → inline-flex; radius-full; a border (css:14 / source:166)  [not in the empty scenario]
 *   .pdx-fb-chip-label         → cursor:pointer (css:32 / source:170)                    [not in the empty scenario]
 *   .pdx-fb-chip-remove        → 16x16; border-radius:50%; cursor:pointer (css:37 / source:187) [not in the empty scenario]
 *   .pdx-fb-clear-btn          → cursor:pointer (css:82 / source:207)                    [not in the empty scenario, only with at least one filter]
 *   .pdx-fb-popover / -field-item → a transient editor in document.body (css:96/118)       [not measurable statically]
 *
 * A conservative geometry across themes: the display is set, the height is content-driven (no exact px),
 * the Add button is cursor:pointer with a non-negative border and radius (metro and cyberpunk zero the radius).
 *
 * ── The chip's remove button ──
 *   It is ICON-ONLY (the "✕" glyph), so it carries an aria-label ("Remove {filter}"); without one axe
 *   ("button-name") reports it. It appears ONLY with at least one chip → outside the empty scenario
 *   certified here (chips are not deterministic).
 */
import type { ComponentManifest } from './_types';

export const filterBuilder: ComponentManifest = {
    name: 'filter-builder',
    tag: 'pdx-filter-builder',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/filter-builder'],

    // ── Scenarios ──
    scenarios: [
        {
            // A deterministic EMPTY state: `fields` set as a property (JS objects cannot be expressed
            // as a static attribute). No chip (value and logic are never read by the component) →
            // the bar renders the "+ Add Filter" button alone. The setup uses a bare `await` (no IIFE).
            id: 'filter-builder-empty',
            title: 'Filter Builder — Empty bar (Add Filter button)',
            html: `
                <div style="max-width: 640px;">
                    <pdx-filter-builder data-test="filter-builder"></pdx-filter-builder>
                </div>`,
            setup: `
                const fb = document.querySelector('section:not([hidden]) [data-test="filter-builder"]');
                if (fb) {
                    fb.fields = [
                        { field: 'name',   label: 'Name',   type: 'string' },
                        { field: 'status', label: 'Status', type: 'string' },
                        { field: 'age',    label: 'Age',    type: 'number' },
                    ];
                    // Wait for the rAF in which ctx.track rebuilds _barEl with the new fields.
                    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
                }
            `,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'filter-builder-empty': {
                standalone: [
                    {
                        // The bar is a flex row that wraps (the host is display:block → the bar is the real layout).
                        selector: 'section:not([hidden]) [data-test="filter-builder"] .pdx-filter-builder',
                        description: 'filter bar is a horizontal flex row (display set)',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // It holds at least the Add button → it has a noticeable height.
                        selector: 'section:not([hidden]) [data-test="filter-builder"] .pdx-filter-builder',
                        description: 'filter bar is tall enough to hold the add button',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        // The Add button: native, interactive → cursor pointer.
                        selector: 'section:not([hidden]) [data-test="filter-builder"] .pdx-fb-add-btn',
                        description: 'add-filter button has cursor pointer (interactive control)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The Add button: a clickable target with a minimum height.
                        selector: 'section:not([hidden]) [data-test="filter-builder"] .pdx-fb-add-btn',
                        description: 'add-filter button is tall enough to be a click target',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        // Add has a non-negative border-radius (radius-full; metro and cyberpunk may zero it).
                        selector: 'section:not([hidden]) [data-test="filter-builder"] .pdx-fb-add-btn',
                        description: 'add-filter button has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // Add has a non-negative border width (1px dashed at the base).
                        selector: 'section:not([hidden]) [data-test="filter-builder"] .pdx-fb-add-btn',
                        description: 'add-filter button has non-negative border width',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                ],
                // Composition: the Add button is contained in the bar and does not cross its right edge.
                composition: [
                    {
                        description: 'add-filter button is contained within the filter bar',
                        parent: 'section:not([hidden]) [data-test="filter-builder"] .pdx-filter-builder',
                        children: {
                            bar: 'section:not([hidden]) [data-test="filter-builder"] .pdx-filter-builder',
                            addBtn: 'section:not([hidden]) [data-test="filter-builder"] .pdx-fb-add-btn',
                        },
                        relations: [
                            {
                                description: 'add button is contained within the bar box',
                                left: 'addBtn',
                                op: 'contained-in',
                                right: 'bar',
                            },
                            {
                                description: 'add button right edge does not overflow the bar right edge',
                                left: 'addBtn.right',
                                op: '<=',
                                right: 'bar.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    // In the empty state the only control is the Add button, with the text "+ Add Filter" → a valid accessible
    // name (no disableRule needed). The ICON-ONLY chip remove button (see the header) appears ONLY
    // with at least one chip — a state that is not deterministic, outside this file.
    a11y: {
        scenarios: ['filter-builder-empty'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'filter-builder-empty',
        targets: [
            // A content-driven bar (its height is the Add button with the theme's font and line-height, sensitive to the
            // host's hostile CSS) → skipHeight (as for field-list and toolbar). The bar has no radius or border
            // of its own (`.pdx-filter-builder` is only a flex row): what stays asserted is the width's integrity,
            // which the runner checks by default.
            { selector: 'section:not([hidden]) [data-test="filter-builder"] .pdx-filter-builder', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // It is not a composite widget (no roving, menu or trap in the source): the only control in the empty
    // state is the native Add button. Tab must put the focus on it. (The field-picker popover that opens
    // on a click would use a menu or listbox pattern, but it is transient and not part of the certified state.)
    keyboard: {
        scenario: 'filter-builder-empty',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="filter-builder"] .pdx-fb-add-btn' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: the empty bar with its "+ Add Filter" button (the maths does not catch the
    // text, the icon or the dashed button's colour per theme).
    visual: {
        scenarios: ['filter-builder-empty'],
    },
};

export default filterBuilder;
