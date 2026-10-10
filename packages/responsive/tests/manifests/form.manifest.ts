/**
 * MANIFEST — pdx-form
 *
 * Contracts written by inspecting the source (packages/ui/src/form/pdx-form.ts) and the CSS
 * (packages/design/src/components/form.css, the ".pdx-form" block, lines 4-8).
 *
 * DOM STRUCTURE (Light DOM, render in pdx-form.ts lines 145-152):
 *   <pdx-form>                                    ← host CE
 *     <form class="pdx-form [formClass]" novalidate autocomplete="off">  ← a NATIVE <form>
 *       <slot></slot>                             ← the fields and actions the developer slots in
 *     </form>
 *   </pdx-form>
 *
 *   - It renders a NATIVE <form> (not a div with role=form). The accessible role is 'form' ONLY when the
 *     <form> has an accessible name (aria-label/aria-labelledby); without a name the browser does not
 *     expose the "form" landmark → correct native behaviour, not a bug. In the scenarios
 *     an aria-label is added on the <form> through the native prop, to exercise the named landmark.
 *   - novalidate is ALWAYS there → the browser's native validation is off (the
 *     component validates through the Form instance). That does NOT change the layout.
 *   - .pdx-form: display:flex; flex-direction:column; gap lg. Universal, no theme-specific px
 *     (the gap uses a token that can vary by theme → it is NOT asserted in px).
 *
 * The relevant PROPS / EVENTS:
 *   - props: form (Object, required), name, autocomplete, scrollToError, formClass, source,
 *     recordId. There is NO "layout" prop and no "disabled" prop on the component (the prompt assumed them):
 *     verified in the source, props on lines 12-27. So no layout or disabled scenario is created.
 *   - events: 'pdx-submit' { values } (or {values,saved} with a DataSource), 'pdx-submit-error'.
 *     It does NOT emit a custom 'submit' event: it intercepts the native submit (@submit) and ALWAYS calls
 *     e.preventDefault() (lines 74-76). No public method is exposed (the setup's return exposes
 *     internal handlers to the render, not on ctx.el) → no method needs declaring.
 *
 * SUBMIT IN THE TESTS — navigation safety:
 *   onSubmit ALWAYS calls e.preventDefault() and then returns at once when `form` is null (lines 76-77). The
 *   scenarios pass no `form` prop (it is a JS instance, not expressible in static HTML) → the
 *   component logs a warning and renders the <form class="pdx-form"> with its slot anyway. To
 *   rule out ANY submit or navigation even if the preventDefault did not fire, the
 *   submit button uses type="button" (it does not trigger the native form's submit). A double guarantee.
 *
 * THE SCENARIO: a <form> with 2-3 deterministic slotted fields. It uses <pdx-form-field> with a
 *   native <input class="pdx-input"> plus a <pdx-form-actions> holding a <button type="button">.
 *   The fields are content-driven (their height varies with the theme and the host) → conservative contracts.
 *
 * A contract NOTE: .pdx-form has no border, radius or shadow of its own (it is a pure flex container) →
 *   no border or radius is asserted. What is asserted is display=flex, height > 0 (it holds the fields), and
 *   the fields' containment and stacking.
 */
import type { ComponentManifest } from './_types';

export const form: ComponentManifest = {
    name: 'form',
    tag: 'pdx-form',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/form', '@pdxui/ui/form-field', '@pdxui/ui/form-actions'],

    // ── Scenarios ──
    scenarios: [
        {
            // A native form with an accessible label, two slotted form-fields and one action.
            // The button is type="button" → no submit and no navigation during the tests.
            id: 'form-basic',
            title: 'Form — Native <form> with two fields + action',
            html: `
                <div style="max-width: 480px;">
                    <pdx-form data-test="form" aria-label="Contact details">
                        <pdx-form-field data-test="field-1" label="Full name">
                            <input class="pdx-input" type="text" name="name" data-test="control-1" value="Ada Lovelace" />
                        </pdx-form-field>
                        <pdx-form-field data-test="field-2" label="Email address">
                            <input class="pdx-input" type="email" name="email" data-test="control-2" value="ada@example.com" />
                        </pdx-form-field>
                        <pdx-form-actions data-test="actions">
                            <button type="button" class="pdx-btn pdx-primary" data-test="submit">Save</button>
                        </pdx-form-actions>
                    </pdx-form>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'form-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="form"] form.pdx-form',
                        description: 'form renders a native <form> as a vertical flex (column stack)',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="form"] form.pdx-form',
                        description: 'form is tall enough to hold two fields + an action row',
                        height: { op: '>', value: 0 },
                    },
                ],
                // Composition: the two fields and the action row are CONTAINED in the <form> and STACKED
                // vertically (field1 above field2 above the actions). Universal geometry.
                composition: [
                    {
                        description: 'fields and actions are stacked and contained within the form box',
                        parent: 'section:not([hidden]) [data-test="form"] form.pdx-form',
                        children: {
                            form: 'section:not([hidden]) [data-test="form"] form.pdx-form',
                            field1: 'section:not([hidden]) [data-test="field-1"]',
                            field2: 'section:not([hidden]) [data-test="field-2"]',
                            actions: 'section:not([hidden]) [data-test="actions"]',
                        },
                        relations: [
                            {
                                description: 'first field is contained within the form box',
                                left: 'field1',
                                op: 'contained-in',
                                right: 'form',
                            },
                            {
                                description: 'second field is contained within the form box',
                                left: 'field2',
                                op: 'contained-in',
                                right: 'form',
                            },
                            {
                                description: 'actions row is contained within the form box',
                                left: 'actions',
                                op: 'contained-in',
                                right: 'form',
                            },
                            {
                                description: 'second field stacks below the first field',
                                left: 'field1.bottom',
                                op: '<=',
                                right: 'field2.top',
                                tolerance: 1,
                            },
                            {
                                description: 'actions row stacks below the second field',
                                left: 'field2.bottom',
                                op: '<=',
                                right: 'actions.top',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // The native <form> has an aria-label ("Contact details") → a named form landmark. The fields
        // have labels bound by pdx-form-field. A clean native pattern, no disableRule.
        scenarios: ['form-basic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'form-basic',
        targets: [
            // A content-driven container: its height is the sum of the fields plus the gaps, sensitive to the
            // host's font and line-height poisoned by the hostile CSS → skipHeight (as for form-field and card).
            // .pdx-form has no border or radius of its own: the runner still checks the width's
            // integrity by default, as the immunity guarantee.
            {
                selector: 'section:not([hidden]) [data-test="form"] form.pdx-form',
                tolerancePx: 10,
                skipHeight: true,
                leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopColor'] }],
            },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // The form is not a composite widget: no roving, trap or menu. The focus management is
        // the slotted fields' native one (Tab goes from field to field). Pattern: none.
        scenario: 'form-basic',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="control-1"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['form-basic'],
        // Masks the inputs' values (the cursor and the text), for stability across operating systems.
        mask: ['section:not([hidden]) [data-test="form"] input'],
    },
};

export default form;
