/**
 * MANIFEST — pdx-field-list
 *
 * A dynamic list of fields bound to a form (rows added and removed, each one an item of an array
 * field). Source inspected: packages/ui/src/field-list/pdx-field-list.ts.
 * CSS: packages/design/src/components/form.css, the "pdx-field-list" block (lines 135-249).
 *
 * ── DETERMINISM: why the certified scenario is the EMPTY STATE plus the Add button ──
 *
 * The component has NO `items` prop: the rows come from the FIELDS of a `Form` (the `:form`
 * prop, or the form context). The rendering (ctx.track + rAF, lines 171-371) does:
 *   - getForm() → null when no form is given;
 *   - _itemCount starts at 0 (a signal, line 88); syncItemCount() is a no-op without the form internals;
 *   - addItem()/removeItem() are NO-OPs without the form internals (they return early, lines 114/138).
 *
 * A `Form` is a JS object that can be passed ONLY as a property (`:form`), impossible from static
 * HTML markup. The per-scenario `setup` (generate.ts lines 72-79) runs in a module script that
 * imports ONLY `@pdxui/design` and `@pdxui/ui`, NOT `@pdxui/core` → `createForm` is not
 * in scope. Building a form there would be fragile (a dynamic import, the timing) and outside the pattern of the
 * other manifests. To have a 100% deterministic state from markup ALONE, the EMPTY STATE is the choice:
 *
 *   count === 0  →  render path (lines 190-347):
 *     - showAdd = canAdd() = (0 < maxItems[999]) = true
 *     - the header is rendered (label || showAdd) with the Add button (`+ Add`, .pdx-outline)
 *     - empty state `.pdx-field-list-empty` ("No items")
 *     - NO add footer (it appears only when count > 0), NO rows, NO remove or edit button
 *
 * This state is stable across operating systems and themes, and it exercises the `.pdx-field-list` wrapper, the header with
 * its Add button (whose accessible name is the text "+ Add") and the empty state. It is the only state fully
 * declarable from markup. The rows (and the remove and edit buttons) need a form and are outside the
 * contract certified here — the a11y bug on remove/edit is written down below and in the report, NOT
 * fixed (the task's constraint).
 *
 * ── CLASSES VERIFIED (source + form.css) ──
 *   .pdx-field-list          → display:flex; flex-direction:column (wrapper, source line 187 / css 136)
 *   .pdx-field-list-header   → flex, justify-content:space-between (line 192 / css 141)
 *   .pdx-field-list-empty    → padding lg, text-align center (line 344 / css 192)
 *   the Add button           → <button class="pdx-outline" size="sm">  (source line 201)
 *   (with rows — NOT in this scenario: .pdx-field-list-rows, -row, -cell, -cell-actions;
 *    the remove <button class="pdx-ghost pdx-danger">× with a `title` ONLY, NO aria-label, lines 324-327)
 *
 * A conservative geometry across themes: the display is set, the height is content-driven (no exact px),
 * the Add button is cursor pointer. The wrapper has no radius or border of its own (.pdx-field-list has none).
 *
 * ── A REAL a11y BUG (written down, NOT fixed) ──
 *   The icon-only `remove` (×) and `edit` (✎) buttons have a `title` ONLY, NO aria-label and no text:
 *     pdx-field-list.ts:324-327  removeBtn.textContent = '×'; removeBtn.title = ...remove...
 *     pdx-field-list.ts:314-315  editBtn.textContent = '✎';  editBtn.title  = ...edit...
 *   `title` is NOT a reliable accessible name (axe's "button-name" rule reports it). The fix: add
 *   removeBtn.setAttribute('aria-label', ...) / editBtn.setAttribute('aria-label', ...). Questi
 *   those buttons exist only with rows (which need a form) → outside the empty scenario certified here.
 */
import type { ComponentManifest } from './_types';

export const fieldList: ComponentManifest = {
    name: 'field-list',
    tag: 'pdx-field-list',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/field-list'],

    // ── Scenarios ──
    scenarios: [
        {
            // A deterministic EMPTY state: no form → 0 rows. The render is the header (with Add) plus the empty state.
            // It is the only state expressible from markup ALONE (the rows need a Form, passed as a property).
            id: 'field-list-empty',
            title: 'Field List — Empty state (Add button + empty message)',
            html: `
                <div style="max-width: 480px;">
                    <pdx-field-list data-test="field-list" label="Order items" name="items"></pdx-field-list>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'field-list-empty': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list',
                        description: 'field-list wrapper is a vertical flex column (display set)',
                        display: { op: 'oneOf', value: ['flex', 'block', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list',
                        description: 'wrapper is tall enough to hold header + empty message',
                        height: { op: '>=', value: 30 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list-empty',
                        description: 'empty state message is rendered (has height) when there are no items',
                        height: { op: '>', value: 0 },
                    },
                    {
                        // The Add button in the header: a native button → it must be pointer (interactive).
                        selector: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list-header button',
                        description: 'add button has cursor pointer (interactive control)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list-header button',
                        description: 'add button is tall enough to be a touch/click target',
                        height: { op: '>=', value: 20 },
                    },
                ],
                // Composition: the header (with Add) ABOVE the empty state; both contained in the wrapper.
                composition: [
                    {
                        description: 'header (with add button) sits above the empty message, both contained in the wrapper',
                        parent: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list',
                        children: {
                            wrapper: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list',
                            header: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list-header',
                            addBtn: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list-header button',
                            empty: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list-empty',
                        },
                        relations: [
                            {
                                description: 'header is contained within the wrapper box',
                                left: 'header',
                                op: 'contained-in',
                                right: 'wrapper',
                            },
                            {
                                description: 'empty message is contained within the wrapper box',
                                left: 'empty',
                                op: 'contained-in',
                                right: 'wrapper',
                            },
                            {
                                description: 'add button is contained within the header',
                                left: 'addBtn',
                                op: 'contained-in',
                                right: 'header',
                            },
                            {
                                description: 'header sits above the empty message (vertical stacking)',
                                left: 'header.bottom',
                                op: '<=',
                                right: 'empty.top',
                                tolerance: 2,
                            },
                            {
                                description: 'empty message right edge does not overflow the wrapper',
                                left: 'empty.right',
                                op: '<=',
                                right: 'wrapper.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    // In the empty state the only control is the Add button, whose text is "+ Add" → it has a valid
    // accessible name (no disableRule needed). The icon-only remove(×) and edit(✎) buttons — with no
    // aria-label, see the file's header — exist ONLY with rows (which need a Form) and do not appear here:
    // the bug is written down in the report, outside the certified scenario.
    a11y: {
        scenarios: ['field-list-empty'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'field-list-empty',
        targets: [
            // A content-driven wrapper (height = header + empty message, sensitive to the font/line-height
            // host values poisoned by the hostile CSS) → skipHeight (as for list, form-field and card). The wrapper has
            // no radius or border of its own (.pdx-field-list is only a flex column): what stays asserted is the
            // width's integrity, which the runner checks by default.
            { selector: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // It is not a composite widget (no roving, no menu, no trap): the only control in the empty state is the
        // native Add button. Tab must put the focus on it.
        scenario: 'field-list-empty',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="field-list"] .pdx-field-list-header button' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        // One scenario: the header with the Add button plus the empty state (the maths does not catch the text or the colour).
        scenarios: ['field-list-empty'],
    },
};

export default fieldList;
