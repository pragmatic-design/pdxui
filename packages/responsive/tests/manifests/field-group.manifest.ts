/**
 * MANIFEST — pdx-field-group
 *
 * A NOTE ON SCOPE (it matters): the real component is NOT a layout helper with
 * orientation and horizontal-vertical gaps. The source (packages/ui/src/field-group/pdx-field-group.ts)
 * defines it as a FORM component that groups several fields and scopes the name by path
 * (name → a nested object key in the form). The REAL props: name, label, display (inline|dialog|panel),
 * collapsed. There is no orientation or gap prop. This manifest certifies the REAL component in its
 * inline mode (the default), with several slotted fields.
 *
 * DOM STRUCTURE — inline mode (the default), render in pdx-field-group.ts lines 108-116:
 *   <pdx-field-group>                                  ← host CE (light DOM)
 *     <fieldset class="pdx-field-group" role="group" aria-label="{label}">  ← a NATIVE <fieldset>
 *       <legend class="pdx-field-group-legend">{label}</legend>   ← only when label is set (line 111)
 *       <div class="pdx-field-group-content">          ← display:flex column, gap md (form.css 93-97)
 *         <slot></slot>                                ← i campi slottati, impilati
 *       </div>
 *     </fieldset>
 *   </pdx-field-group>
 *
 * CLASSES VERIFIED (source + packages/design/src/components/form.css, the block at lines 78-133):
 *   .pdx-field-group         → border 1px solid color-border, border-radius md, padding (form.css 79-84)
 *   .pdx-field-group-legend  → the legend's font, weight and colour (form.css 86-91)
 *   .pdx-field-group-content → display:flex; flex-direction:column; gap md (form.css 93-97)
 *   (the -panel / -dialog / -trigger classes apply to display="panel|dialog" only; the panel has
 *   its own scenario, field-group-panels)
 *
 * GEOMETRY — universal, no theme-specific px:
 *   - .pdx-field-group is a bordered box (border-width > 0, radius >= 0: metro and cyberpunk zero it).
 *   - .pdx-field-group-content is a flex column → the fields stack: field1 ABOVE field2.
 *   - the fields are CONTAINED in the fieldset's box (contained-in).
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * ACCESSIBILITY:
 *
 * The source emits two things on the <fieldset>:
 *     role="group"   (redundant: a <fieldset> already has an implicit role=group — harmless)
 *     :aria-label="${() => ctx.label() || null}"   ← null removes the attribute when label is ''
 *
 * With a label set (our scenarios): aria-label is NOT empty → the group HAS an accessible
 *   name. The pattern is right. axe passes.
 *
 * With an EMPTY label an aria-label="" would give NO accessible name AND suppress the native
 *   fallback to the <legend>, which is why the binding writes null instead.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * THE SCENARIO: inline mode (the default), a group label plus 2 deterministic native fields slotted in.
 *   Native fields (label+input) are used, for clean a11y associations and a stable geometry.
 */
import type { ComponentManifest } from './_types';

export const fieldGroup: ComponentManifest = {
    name: 'field-group',
    tag: 'pdx-field-group',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/field-group'],

    // ── Scenarios ──
    scenarios: [
        {
            // Inline (the default): a group legend plus 2 native fields stacked in the flex-column content.
            id: 'field-group-basic',
            title: 'Field Group — Inline group with label + stacked fields',
            html: `
                <div style="max-width: 480px;">
                    <pdx-field-group data-test="group" name="customer" label="Customer details">
                        <label class="pdx-field" data-test="field-1">
                            <span>First name</span>
                            <input type="text" class="pdx-input" value="Ada" />
                        </label>
                        <label class="pdx-field" data-test="field-2">
                            <span>Last name</span>
                            <input type="text" class="pdx-input" value="Lovelace" />
                        </label>
                    </pdx-field-group>
                </div>`,
        },
        {
            // display="panel", one collapsed and one expanded. A collapsed fieldset that kept
            // its padding would be a 65px bordered box for a 24px legend, 40px of empty frame.
            id: 'field-group-panels',
            title: 'Field Group — Panels, collapsed and expanded',
            html: `
                <div style="max-width: 480px; display: grid; gap: 16px;">
                    <pdx-field-group data-test="panel-closed" name="billing" label="Billing" display="panel" collapsed>
                        <label class="pdx-field"><span>IBAN</span><input type="text" class="pdx-input" value="IT60X0542811101000000123456" /></label>
                    </pdx-field-group>
                    <pdx-field-group data-test="panel-open" name="contact" label="Contact" display="panel">
                        <label class="pdx-field"><span>Email</span><input type="text" class="pdx-input" value="ada@example.com" /></label>
                    </pdx-field-group>
                    <pdx-field-group data-test="panel-unlabelled" name="notes" display="panel" collapsed>
                        <label class="pdx-field"><span>Notes</span><input type="text" class="pdx-input" value="Call after 5 pm" /></label>
                    </pdx-field-group>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'field-group-basic': {
                standalone: [
                    {
                        // The inner content is the flex column that stacks the fields (form.css 93-97).
                        selector: 'section:not([hidden]) [data-test="group"] .pdx-field-group-content',
                        description: 'field-group content is a vertical flex (column stack of fields)',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="group"] fieldset.pdx-field-group',
                        description: 'field-group box is tall enough to hold legend + two fields',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // bordered by default (border 1px solid) → width > 0.
                        selector: 'section:not([hidden]) [data-test="group"] fieldset.pdx-field-group',
                        description: 'field-group has a visible border (width > 0)',
                        border: { all: { width: { op: '>', value: 0 } } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="group"] fieldset.pdx-field-group',
                        description: 'field-group has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // Composition: the legend ABOVE the content; the fields STACKED (field1 above field2) and
                // CONTAINED in the fieldset's box.
                composition: [
                    {
                        description: 'legend above content; fields stacked vertically and contained in the group box',
                        parent: 'section:not([hidden]) [data-test="group"] fieldset.pdx-field-group',
                        children: {
                            box: 'section:not([hidden]) [data-test="group"] fieldset.pdx-field-group',
                            legend: 'section:not([hidden]) [data-test="group"] .pdx-field-group-legend',
                            content: 'section:not([hidden]) [data-test="group"] .pdx-field-group-content',
                            field1: 'section:not([hidden]) [data-test="field-1"]',
                            field2: 'section:not([hidden]) [data-test="field-2"]',
                        },
                        relations: [
                            {
                                description: 'legend bottom is at/above content top (legend renders above the fields)',
                                left: 'legend.bottom',
                                op: '<=',
                                right: 'content.top',
                                tolerance: 2,
                            },
                            {
                                description: 'content area is contained within the field-group box',
                                left: 'content',
                                op: 'contained-in',
                                right: 'box',
                            },
                            {
                                description: 'first field is contained within the field-group box',
                                left: 'field1',
                                op: 'contained-in',
                                right: 'box',
                            },
                            {
                                description: 'second field is contained within the field-group box',
                                left: 'field2',
                                op: 'contained-in',
                                right: 'box',
                            },
                            {
                                description: 'fields are stacked: second field is below the first (column orientation)',
                                left: 'field1.bottom',
                                op: '<=',
                                right: 'field2.top',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            // A collapsed panel is its legend line and its border, and collapsing leaves the
            // legend — the chevron and the click area — as it is.
            'field-group-panels': {
                // A collapsed panel with no label still has a toggle to open it: its chevron, named by
                // the registered string (axe checks the name).
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="panel-unlabelled"] legend button.pdx-field-group-toggle',
                        description: 'an unlabelled collapsed panel shows a toggle at least 8px wide',
                        width: { op: '>=', value: 8 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="panel-unlabelled"] legend button.pdx-field-group-toggle',
                        description: 'an unlabelled collapsed panel shows a toggle at least 8px tall',
                        height: { op: '>=', value: 8 },
                    },
                ],
                composition: [
                    {
                        description: 'a collapsed panel is no taller than its legend, its two borders and 8px',
                        parent: 'section:not([hidden]) [data-test="panel-closed"]',
                        children: {
                            closed: 'section:not([hidden]) [data-test="panel-closed"] fieldset.pdx-field-group',
                            closedLegend: 'section:not([hidden]) [data-test="panel-closed"] .pdx-field-group-legend',
                            openLegend: 'section:not([hidden]) [data-test="panel-open"] .pdx-field-group-legend',
                            openContent: 'section:not([hidden]) [data-test="panel-open"] .pdx-field-group-content',
                        },
                        relations: [
                            { description: 'collapsed height <= legend + 2 borders + 8px', left: 'closed.height', op: '<=', right: 'closedLegend.height + 10' },
                            { description: 'the legend is as tall collapsed as expanded', left: 'closedLegend.height', op: '==', right: 'openLegend.height' },
                            { description: 'the expanded panel still shows its content below the legend', left: 'openLegend.bottom', op: '<=', right: 'openContent.top', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // A scenario with the label set → the <fieldset role=group> HAS an accessible name
        // (aria-label="Customer details", besides the <legend>). The pattern is right: no disableRule.
        // The empty-label edge (see the header comment) is NOT covered here on purpose: the happy path is
        // what is certified.
        // field-group-panels: the panel's toggle is a button in the legend (aria-expanded, aria-controls);
        // the unlabelled panel's toggle is named by the registered string.
        scenarios: ['field-group-basic', 'field-group-panels'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'field-group-basic',
        targets: [
            // A content-driven container: its height is the legend plus the sum of the fields, sensitive to
// host font/line-height poisoned by the hostile CSS → the fields reflow and the height follows
            // (which is legitimate, not a containment failure). skipHeight; the width, radius and border (CSS values,
            // not scaled) stay asserted as the real immunity guarantee (as for fieldset and card).
            {
                selector: 'section:not([hidden]) [data-test="group"] fieldset.pdx-field-group',
                tolerancePx: 10,
                skipHeight: true,
            },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The panel's toggle, the one control the component adds: a disclosure button in the legend.
    // A <legend role="button"> with no tabindex would let Tab go past it, and a collapsed panel
    // could not be opened.
    keyboard: {
        scenario: 'field-group-panels',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="panel-closed"] legend button',
              expectAttr: { selector: 'section:not([hidden]) [data-test="panel-closed"] legend button', name: 'aria-expanded', value: 'false' } },
            { key: 'Enter', expectFocus: 'section:not([hidden]) [data-test="panel-closed"] legend button',
              expectAttr: { selector: 'section:not([hidden]) [data-test="panel-closed"] legend button', name: 'aria-expanded', value: 'true' } },
            // Expanded, the next tab stop is the panel's own field.
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="panel-closed"] input' },
            { key: 'Shift+Tab', expectFocus: 'section:not([hidden]) [data-test="panel-closed"] legend button' },
            { key: 'Space',
              expectAttr: { selector: 'section:not([hidden]) [data-test="panel-closed"] legend button', name: 'aria-expanded', value: 'false' } },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['field-group-basic'],
        // Masks the inputs' values (their text and cursor), for stability across operating systems.
        mask: ['section:not([hidden]) [data-test="group"] input'],
    },
};

export default fieldGroup;
