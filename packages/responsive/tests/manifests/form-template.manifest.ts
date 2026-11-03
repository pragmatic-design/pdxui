/**
 * MANIFEST — pdx-form-template
 *
 * WHAT THE COMPONENT DOES (source: packages/ui/src/form-template/pdx-form-template.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 * A SCHEMA-DRIVEN form generator. It takes a `FormSchema` (a JSON object) through the
 * `:schema` prop and renders a whole form:
 *   - a pdx-* control per field (the TYPE_TAG map: text→pdx-input, number→pdx-number-input, …);
 *     every field is wrapped in a <pdx-form-field name=… label=…> (which in turn renders .pdx-form-field);
 *   - a layout configurable per form or per section: 'stack' (a column), 'grid' (a CSS grid of N columns),
 *     'horizontal' (a wrapping flex), 'wizard' (the sections as steps);
 *   - sections → <fieldset class="pdx-form-section"> with a <legend>, collapsible;
 *   - reactive conditional visibility (visibleWhen), validators from the schema.
 *
 * DOM STRUCTURE (Light DOM):
 *   <pdx-form-template>
 *     <pdx-form>                                         ← render: the template wraps everything in a pdx-form
 *       <div class="pdx-form-template-content">          ← popolata IMPERATIVAMENTE in rAF
 *         <div class="pdx-form-template-fields" style="display:grid; grid-template-columns: repeat(N,1fr)">
 *           <pdx-form-field name=… label=… style="grid-column: span S">
 *             <div class="pdx-form-field">…<label class="pdx-field-label"> + <input class="pdx-input">…</div>
 *           </pdx-form-field>
 *           … (one wrapper per field)
 *         </div>
 *         <slot name="actions"> <pdx-form-actions/> </slot>   ← when showActions (true by default)
 *       </div>
 *     </pdx-form>
 *   </pdx-form-template>
 *
 * HOW THIS WAS MADE DETERMINISTIC
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. The `schema` prop is of type Object: it canNOT be set from a static HTML attribute. The scenario
 *    mounts <pdx-form-template> WITHOUT a schema and the `setup` assigns `host.schema = {…}` as a JS PROPERTY
 *    (the same object-prop pattern select and autocomplete use for `.options`).
 * 2. The schema is FIXED and minimal: 2 text fields (firstName, lastName), a 'grid' layout with 2 columns,
 *    size 1 each → the two fields fall side by side on ONE row (a deterministic composition).
 *    No validator, no visibleWhen, nothing async → no non-determinism.
 * 3. `showActions: false` as an attribute → no <pdx-form-actions> (it removes a variable block and
 *    keeps the measurement to the fields alone). The generated controls are native <pdx-input>s with a fixed `value`.
 * 4. The render is ASYNCHRONOUS (ctx.track → requestAnimationFrame fills .pdx-form-template-content).
 *    So the `setup`: assigns the schema, then RETRIES (an rAF loop, ~30 frames at most) until the two
 *    .pdx-form-field elements are there — the runner measures a stable DOM only (the inline-edit pattern).
 *
 * CLASSES VERIFIED
 *   - .pdx-form-template-content / .pdx-form-template-fields → packages/design/src/components/form.css (lines 254-269)
 *   - .pdx-form-field / .pdx-field-label → forms.css (rendered by pdx-form-field, see form-field.manifest.ts)
 *   - .pdx-input → the native input generated for a field of type 'text'
 *   The `style="display:grid"` on the fields row is inline from the source (layoutStyle, lines 80-82): universal,
 *   with no theme-specific px (the gap is var(--pdx-space-md), the columns repeat(2,1fr)).
 *
 * REAL BUGS: none. The component uses <pdx-form-field> (native label↔input) and native <fieldset>/<legend>
 * for the sections: accessible patterns. The label↔input aria wiring is delegated to pdx-form-field
 * (certified separately). See the a11y note below for the axe scope.
 */
import type { ComponentManifest } from './_types';

// rAF retry: the schema is set as a property and the render happens in an rAF. It waits for the two
// .pdx-form-field elements to exist before the runner measures (~30 frames at most, ≈ 0.5s).
// Note: the generator runs the setup inside an `async function () { ... }`, so `await` is used
// directly here — do NOT wrap it in a non-async IIFE (the await would be an esbuild syntax error).
const SETUP_GRID = `
        const host = document.querySelector('section:not([hidden]) [data-test="ft"]');
        if (!host) return;
        host.showActions = false;
        host.schema = {
            layout: 'grid',
            columns: 2,
            fields: [
                { name: 'firstName', type: 'text', label: 'First name', size: 1, value: 'Ada' },
                { name: 'lastName',  type: 'text', label: 'Last name',  size: 1, value: 'Lovelace' },
            ],
        };
        await new Promise((resolve) => {
            let tries = 0;
            (function attempt() {
                const fields = host.querySelectorAll('.pdx-form-template-content .pdx-form-field');
                if (fields.length >= 2 || tries++ > 30) { resolve(); return; }
                requestAnimationFrame(attempt);
            })();
        });`;

// The wizard layout (#293): its sections are the steps of a pdx-wizard. Waits for the wizard's stepper.
const SETUP_WIZARD = `
        const host = document.querySelector('section:not([hidden]) [data-test="ftw"]');
        if (!host) return;
        host.schema = {
            layout: 'wizard',
            sections: [{ name: 'who', label: 'Requester' }, { name: 'what', label: 'Request' }],
            fields: [
                { name: 'name', type: 'text', label: 'Name', section: 'who', required: true },
                { name: 'topic', type: 'text', label: 'Topic', section: 'what' },
            ],
        };
        await new Promise((resolve) => {
            let tries = 0;
            (function attempt() {
                if (host.querySelector('[aria-current="step"]') || tries++ > 60) { resolve(); return; }
                requestAnimationFrame(attempt);
            })();
        });`;

// A collapsible section (#847): its toggle is a button in the legend. Waits for the toggle.
const SETUP_SECTIONS = `
        const host = document.querySelector('section:not([hidden]) [data-test="fts"]');
        if (!host) return;
        host.showActions = false;
        host.schema = {
            sections: [{ name: 'address', label: 'Address', collapsible: true }],
            fields: [{ name: 'street', type: 'text', label: 'Street', section: 'address' }],
        };
        await new Promise((resolve) => {
            let tries = 0;
            (function attempt() {
                if (host.querySelector('.pdx-form-section-toggle') || tries++ > 60) { resolve(); return; }
                requestAnimationFrame(attempt);
            })();
        });`;

export const formTemplate: ComponentManifest = {
    name: 'form-template',
    tag: 'pdx-form-template',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/form-template'],

    // ── Scenarios ──
    scenarios: [
        {
            // Schema-driven, 2 text fields, a 2-column grid layout, no actions.
            // data-test on the fields through their name (the wrappers have no data-test → nth/name is used).
            id: 'form-template-grid',
            title: 'Form Template — Schema-driven grid (2 cols, 2 fields)',
            html: `
                <div style="max-width: 640px;">
                    <pdx-form-template data-test="ft"></pdx-form-template>
                </div>`,
            setup: SETUP_GRID,
        },
        {
            // The wizard layout: a pdx-wizard, one panel per section (A6 is the wizard's, #293).
            id: 'form-template-wizard',
            title: 'Form Template — Wizard layout (2 steps)',
            html: `
                <div style="max-width: 640px;">
                    <pdx-form-template data-test="ftw"></pdx-form-template>
                </div>`,
            setup: SETUP_WIZARD,
        },
        {
            // A collapsible section: the disclosure button in its legend (#847).
            id: 'form-template-sections',
            title: 'Form Template — Collapsible section',
            html: `
                <div style="max-width: 640px;">
                    <pdx-form-template data-test="fts"></pdx-form-template>
                </div>`,
            setup: SETUP_SECTIONS,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'form-template-grid': {
                standalone: [
                    {
                        // The fields row is a CSS grid (the display is set by the source).
                        selector: 'section:not([hidden]) [data-test="ft"] .pdx-form-template-fields',
                        description: 'fields row uses CSS grid layout',
                        display: { op: 'is', value: 'grid' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ft"] .pdx-form-template-content',
                        description: 'content container is tall enough to hold the generated fields',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ft"] .pdx-form-template-content pdx-form-field:nth-of-type(1) .pdx-field-label',
                        description: 'first field label is rendered from schema (has height)',
                        height: { op: '>', value: 0 },
                    },
                ],
                // Composition: the 2 generated fields sit side by side (a 2-column grid, size 1 each),
                // contained in the grid row, the first to the left of the second, on the same top (one row).
                composition: [
                    {
                        description: 'two generated fields sit side-by-side within the grid row',
                        parent: 'section:not([hidden]) [data-test="ft"] .pdx-form-template-fields',
                        children: {
                            row: 'section:not([hidden]) [data-test="ft"] .pdx-form-template-fields',
                            f1: 'section:not([hidden]) [data-test="ft"] pdx-form-field:nth-of-type(1)',
                            f2: 'section:not([hidden]) [data-test="ft"] pdx-form-field:nth-of-type(2)',
                        },
                        relations: [
                            {
                                description: 'first field is contained within the grid row',
                                left: 'f1',
                                op: 'contained-in',
                                right: 'row',
                            },
                            {
                                description: 'second field is contained within the grid row',
                                left: 'f2',
                                op: 'contained-in',
                                right: 'row',
                            },
                            {
                                description: 'first field is left of the second (2-column grid)',
                                left: 'f1.right',
                                op: '<=',
                                right: 'f2.left',
                                tolerance: 2,
                            },
                            {
                                description: 'both fields share the same row (f1 top not below f2 top)',
                                left: 'f1.top',
                                op: '<=',
                                right: 'f2.top',
                                tolerance: 2,
                            },
                            {
                                description: 'both fields share the same row (f2 top not below f1 top)',
                                left: 'f2.top',
                                op: '<=',
                                right: 'f1.top',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            // One stepper, the wizard's, with one current step; the step in view shows its field.
            'form-template-wizard': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ftw"] [role="tablist"]',
                        description: 'the wizard layout has one stepper',
                        count: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ftw"] [aria-current="step"]',
                        description: 'one step is the current one (A6)',
                        count: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ftw"] [data-wizard-step]:not([aria-hidden="true"]) .pdx-field-label',
                        description: 'the step in view shows its field',
                        height: { op: '>', value: 0 },
                    },
                ],
            },
            // The toggle is a real button in the legend, and the legend pretends to be none (#847).
            'form-template-sections': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="fts"] legend > button.pdx-form-section-toggle[aria-expanded][aria-controls]',
                        description: 'a collapsible section\'s toggle is a button in its legend',
                        count: { op: '==', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="fts"] legend[role]',
                        description: 'the legend is no pretend button',
                        count: { op: '==', value: 0 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // The generated controls are wrapped in <pdx-form-field> with the label bound to the input.
        // If the label↔input association were missing (form-field's async wiring), axe would report
        // the "label" rule. No disableRule: the generated fields' pattern is native and clean.
        // The wizard layout too: its stepper is pdx-wizard's, tabs naming their panels (#293).
        // And a collapsible section, whose toggle is a button named by the section (#847).
        scenarios: ['form-template-grid', 'form-template-wizard', 'form-template-sections'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'form-template-grid',
        targets: [
            // A content-driven container: its height is the sum of the generated fields, sensitive to the
            // host's font and line-height poisoned by the hostile CSS → skipHeight (as for card and form-field).
            // The fields row has no radius or border of its own; the runner checks the width's integrity.
            {
                selector: 'section:not([hidden]) [data-test="ft"] .pdx-form-template-content',
                tolerancePx: 10,
                skipHeight: true,
            },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // The form-template is not a composite widget of its own: it is a layout hosting native fields,
        // whose focus is the generated controls'. What it adds is a collapsible section's toggle (#847):
        // Tab reaches it, Enter and Space toggle it, and expanded, Tab goes on to the first generated input.
        scenario: 'form-template-sections',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="fts"] .pdx-form-section-toggle',
              expectAttr: { selector: 'section:not([hidden]) [data-test="fts"] .pdx-form-section-toggle', name: 'aria-expanded', value: 'true' } },
            { key: 'Enter',
              expectAttr: { selector: 'section:not([hidden]) [data-test="fts"] .pdx-form-section-toggle', name: 'aria-expanded', value: 'false' } },
            { key: 'Space',
              expectAttr: { selector: 'section:not([hidden]) [data-test="fts"] .pdx-form-section-toggle', name: 'aria-expanded', value: 'true' } },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="fts"] pdx-form-field input' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['form-template-grid'],
        // Masks the generated inputs' values (the cursor and the text), for stability across operating systems.
        mask: ['section:not([hidden]) [data-test="ft"] input'],
    },
};

export default formTemplate;
