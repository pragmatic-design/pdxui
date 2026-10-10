/**
 * MANIFEST — pdx-auto-form
 *
 * WHAT THE COMPONENT DOES (source: packages/ui/src/auto-form/pdx-auto-form.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 * A form generated from DATA. It takes one of two equivalent declarations:
 *   - `:fields`  → FieldDefinition[] (the model shared by grid/form/filter); internally
 *                  converted to a FormSchema via toFormFields() (field→name, label, type→editor).
 *   - `:schema`  → a FormSchema JSON, ready made (the direct alternative).
 * It can also take a `:source` (DataSource) for automatic load/save through `recordId`.
 * The component does NOT draw the fields: it delegates the rendering to <pdx-form-template>, which
 * it hands the resolved schema, the Form instance and `showActions=false`. When its own
 * `showActions` prop (true by default) is on, it appends an actions block of its own (a reset and a
 * submit pdx-button).
 * DOM STRUCTURE (Light DOM — everything is built IMPERATIVELY, no declarative template):
 *   <pdx-auto-form>
 *     <div class="pdx-auto-form">                          ← container, created in rAF (render() = html``)
 *       <pdx-form-template>                                ← created; schema/form/showActions=false
 *         <pdx-form>                                         set inside a NESTED rAF
 *           <div class="pdx-form-template-content">
 *             <div class="pdx-form-template-fields">
 *               <pdx-form-field name=… label=…>
 *                 <div class="pdx-form-field"><label class="pdx-field-label"> + <input class="pdx-input"></div>
 *               </pdx-form-field>
 *               … (one wrapper per field)
 *             </div>
 *           </div>
 *         </pdx-form>
 *       </pdx-form-template>
 *       <div style="display:flex; …">                       ← ONLY when host.showActions (true by default)
 *         <pdx-button variant="ghost">Reset</pdx-button>
 *         <pdx-button variant="primary">Save</pdx-button>
 *       </div>
 *     </div>
 *   </pdx-auto-form>
 *
 * `.pdx-auto-form` has NO dedicated CSS (grep in packages/design → no match): it is a plain div,
 * display:block, with a content-driven height (the template plus any actions). The fields' layout
 * (grid or stack) is <pdx-form-template>'s job, driven by the layout/columns props it
 * the auto-form copies into the resolved schema (resolveSchema, lines 36-48).
 *
 * HOW THIS IS MADE DETERMINISTIC
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. A deep ASYNCHRONOUS chain (two rAFs plus form-template's own):
 *      track → rAF [creates .pdx-auto-form + buildForm] → buildForm creates <pdx-form-template>
 *            → NESTED rAF [tmpl.schema = …] → form-template does ITS rAF to render the .pdx-form-field.
 *    So the `setup` RETRIES (an rAF loop, at most ~40 frames ≈ 0.7s) until the two `.pdx-form-field`
 *    exist inside `.pdx-auto-form` — the runner measures a stable DOM only (the form-template pattern).
 *    Note: the generator runs the setup inside an `async function () { … }`, so `await` is used
 *    DIRECTLY here — NEVER wrap it in a non-async IIFE (an await there is an esbuild syntax error that
 *    breaks the scenario's bundle).
 * 2. A FIXED, minimal declaration through `:fields` (the component's primary path): 2 text fields
 *    (firstName, lastName). `fields` is a prop of type Array → NOT reliably settable as a static HTML
 *    attribute: the `setup` assigns it as a JS PROPERTY (host.fields = […]), the same object-prop
 *    pattern form-template and select use.
 * 3. `layout="grid"` + `columns="2"` as attributes → form-template lays the 2 fields out side by side on
 *    ONE row (a deterministic composition, identical to form-template-grid). No validators, no
 *    visibleWhen, no options, nothing async → no non-determinism.
 * 4. `show-actions="false"` as an attribute → no reset/submit block: it keeps the measurement to the
 *    generated fields alone and removes a variable block (button labels, widths).
 *
 * CLASSES / TAGS VERIFIED (against the source + the real CSS)
 *   - .pdx-auto-form               → the container div the source creates (lines 146-148); NO dedicated CSS.
 *   - .pdx-form-template-content / .pdx-form-template-fields → form.css (rendered by pdx-form-template).
 *   - .pdx-form-field / .pdx-field-label / .pdx-input        → rendered by pdx-form-field (see form-field.manifest.ts).
 *   The pdx-form-field wrappers have no data-test → the host TAG with :nth-of-type is used (as in form-template).
 *
 * REAL BUGS: none. The component composes <pdx-form-template> (which uses <pdx-form-field>:
 * native label↔input pairs) and native <pdx-button>s: accessible patterns. The aria wiring of
 * label↔input is delegated to pdx-form-field, certified separately (see the a11y note).
 */
import type { ComponentManifest } from './_types';

// rAF retry: `fields` is set as a JS property and the render crosses a chain of rAFs
// (auto-form → form-template → form-template's inner one). It waits for the two .pdx-form-field
// to exist inside .pdx-auto-form before the runner measures (at most ~40 frames ≈ 0.7s).
// Note: the generator already wraps the setup in `async function () { … }` → a BARE `await` here.
// NO non-async IIFE (an await outside an async function is an esbuild syntax error → a broken bundle).
const SETUP_FIELDS = `
        const host = document.querySelector('section:not([hidden]) [data-test="af"]');
        if (!host) return;
        host.fields = [
            { field: 'firstName', type: 'text', label: 'First name' },
            { field: 'lastName',  type: 'text', label: 'Last name' },
        ];
        await new Promise((resolve) => {
            let tries = 0;
            (function attempt() {
                const fields = host.querySelectorAll('.pdx-auto-form .pdx-form-field');
                if (fields.length >= 2 || tries++ > 40) { resolve(); return; }
                requestAnimationFrame(attempt);
            })();
        });`;

export const autoForm: ComponentManifest = {
    name: 'auto-form',
    tag: 'pdx-auto-form',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/auto-form'],

    // ── Scenarios ──
    scenarios: [
        {
            // Data-driven through :fields (FieldDefinition[]), 2 text fields, a 2-column grid layout,
            // no actions. show-actions="false" and columns="2" as attributes; fields as a property in the setup.
            id: 'auto-form-fields',
            title: 'Auto Form — Fields-driven grid (2 cols, 2 fields)',
            html: `
                <div style="max-width: 640px;">
                    <pdx-auto-form
                        data-test="af"
                        layout="grid"
                        columns="2"
                        show-actions="false"></pdx-auto-form>
                </div>`,
            setup: SETUP_FIELDS,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'auto-form-fields': {
                standalone: [
                    {
                        // The .pdx-auto-form container is a plain div: display block, and it must
                        // be tall enough to hold the generated fields (content-driven).
                        selector: 'section:not([hidden]) [data-test="af"] .pdx-auto-form',
                        description: 'auto-form container is block-level',
                        display: { op: 'is', value: 'block' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="af"] .pdx-auto-form',
                        description: 'auto-form container is tall enough to hold the generated fields',
                        height: { op: '>=', value: 40 },
                    },
                    {
                        // The row of fields is a CSS grid (the display is set by form-template).
                        selector: 'section:not([hidden]) [data-test="af"] .pdx-form-template-fields',
                        description: 'generated fields row uses CSS grid layout',
                        display: { op: 'is', value: 'grid' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="af"] pdx-form-field:nth-of-type(1) .pdx-field-label',
                        description: 'first generated field label is rendered from the field model (has height)',
                        height: { op: '>', value: 0 },
                    },
                ],
                // Composition: the 2 generated fields sit inside the grid row and are STACKED in a column.
                // Note: toFormFields() (core) does not map the per-field `size` → every generated field uses
                // the default span (12 = full width), so they fall one under the other even with columns=2.
                // That is what the fields-driven path really does (a per-field size cannot be expressed in a
                // FieldDefinition); so the assertion is the stacking, not the side-by-side.
                composition: [
                    {
                        description: 'two generated fields are contained in the grid row, stacked',
                        parent: 'section:not([hidden]) [data-test="af"] .pdx-form-template-fields',
                        children: {
                            row: 'section:not([hidden]) [data-test="af"] .pdx-form-template-fields',
                            f1: 'section:not([hidden]) [data-test="af"] pdx-form-field:nth-of-type(1)',
                            f2: 'section:not([hidden]) [data-test="af"] pdx-form-field:nth-of-type(2)',
                        },
                        relations: [
                            { description: 'first field within the grid row', left: 'f1', op: 'contained-in', right: 'row' },
                            { description: 'second field within the grid row', left: 'f2', op: 'contained-in', right: 'row' },
                            {
                                description: 'second field sits below the first (full-width stack)',
                                left: 'f1.bottom',
                                op: '<=',
                                right: 'f2.top',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // The generated fields are wrapped in <pdx-form-field> with the label bound to the input
        // (the label↔input wiring and the describedby are delegated to pdx-form-field, certified separately).
        // If the association were missing, axe would report the "label" rule. No disableRule:
        // the generated fields' pattern is native and clean (native inputs plus label[for]).
        scenarios: ['auto-form-fields'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'auto-form-fields',
        targets: [
            // A content-driven container: its height is the sum of the generated fields, sensitive to a
            // host font or line-height poisoned by the hostile CSS → skipHeight (as for card and form-template).
            // .pdx-auto-form has no radius or border of its own: the runner checks the width's integrity.
            {
                selector: 'section:not([hidden]) [data-test="af"] .pdx-auto-form',
                tolerancePx: 10,
                skipHeight: true,
                leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }],
            },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // The auto-form is not a composite widget of its own: it is a layout generator that hosts
        // native fields. The focus management is the generated controls'. Tab reaches the first
        // generated input (associated through label/for by pdx-form-field).
        scenario: 'auto-form-fields',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="af"] pdx-form-field:nth-of-type(1) input' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['auto-form-fields'],
        // Masks the generated inputs' values and cursors, for stability across operating systems.
        mask: ['section:not([hidden]) [data-test="af"] input'],
    },
};

export default autoForm;
