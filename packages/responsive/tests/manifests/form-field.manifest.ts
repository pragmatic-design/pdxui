/**
 * MANIFEST — pdx-form-field
 *
 * Contracts written by inspecting the source (packages/ui/src/form-field/pdx-form-field.ts)
 * and the CSS (packages/design/src/surfaces/forms.css, the .pdx-form-field / .pdx-field-* block).
 *
 * DOM STRUCTURE (Light DOM, render in pdx-form-field.ts):
 *   <pdx-form-field>
 *     <div class="pdx-form-field [pdx-form-field-horizontal] [disabled] [has-error|has-warning|has-success]">
 *       <label class="pdx-field-label ..." for="<inputId>">{label}</label>      ← only when label is set
 *       <span class="pdx-field-description" id="<descId>">{description}</span>   ← only with a description
 *       <div class="pdx-form-field-input"><slot></slot></div>                   ← the slotted control
 *       <span class="pdx-field-error"   id="<errorId>" role="alert">{error}</span>  ← when shouldShowError()
 *       | <span class="pdx-field-warning">{warning}</span>
 *       | <span class="pdx-field-success">{success}</span>
 *       | <span class="pdx-field-hint" id="<hintId>">{hint}</span>              ← else-if cascade
 *     </div>
 *   </pdx-form-field>
 *
 * The message CASCADE (ONE span rendered): error > warning > success > hint. So when both a
 * hint and an error are there in the error state, ONLY the error is shown (the hint disappears). The
 * scenari ne tengono conto.
 *
 * ARIA WIRING (ctx.track + requestAnimationFrame, lines 129-178):
 *   - the <label :for="inputId"> is ALWAYS emitted with inputId ("pdx-ff-N-input", say).
 *   - In the rAF after the mount, the first slotted control (input/textarea/select/.pdx-input-wrap/
 *     [role=radiogroup]/[role=group]) gets id=inputId IF it has none → the label↔input association.
 *   - aria-describedby joins the descId/hintId/errorId that exist, on the native input.
 *   - error → aria-invalid="true" on the native input.
 *   CAREFUL: the wiring is async (an rAF). The a11y and keyboard tests already wait for networkidle plus a timeout in the
 *   runner; the rAF resolves well before the measurement. If the association were MISSING, axe would report it
 *   (a label with no control associated → the "label" rule) and the keyboard test would fail on the focus.
 *
 * LAYOUT (.pdx-form-field): display:flex column, gap 2xs. Universale (no px tema-specifici):
 *   vertical → label.bottom <= input.top <= message.top. display is 'flex'.
 *
 * SCENARIOS: a REAL slotted control is required, because the aria wiring looks for an input in the slot.
 * A native <input class="pdx-input"> is used (the id is assigned by the component → the association is testable).
 */
import type { ComponentManifest } from './_types';

export const formField: ComponentManifest = {
    name: 'form-field',
    tag: 'pdx-form-field',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/form-field', '@pdxui/ui/form'],

    // ── Scenarios ──
    scenarios: [
        {
            // (a) A normal field: label + slotted input + hint below.
            id: 'form-field-basic',
            title: 'Form Field — Label + Input + Hint',
            html: `
                <div style="max-width: 420px;">
                    <pdx-form-field
                        data-test="field"
                        label="Email address"
                        hint="We'll never share your email."
                        required>
                        <input class="pdx-input" type="email" data-test="control" placeholder="you@example.com" />
                    </pdx-form-field>
                </div>`,
        },
        {
            // (b) The error state: the error prop plus showError forces it to show even without touched.
            //     The message rendered is the error (the cascade suppresses the hint).
            id: 'form-field-error',
            title: 'Form Field — Error state',
            html: `
                <div style="max-width: 420px;">
                    <pdx-form-field
                        data-test="field"
                        label="Email address"
                        hint="We'll never share your email."
                        error="Enter a valid email address."
                        show-error
                        required>
                        <input class="pdx-input" type="email" data-test="control" value="not-an-email" />
                    </pdx-form-field>
                </div>`,
        },
        {
            // (c) fields in a plain div, the way a card body or a grid cell holds them.
            //     Nothing in the parent spaces them: the field owns its vertical rhythm. The second
            //     one is horizontal, which follows the same rule.
            id: 'form-field-nested',
            title: 'Form Field — Nested in a plain div',
            html: `
                <div data-test="box" style="max-width: 420px;">
                    <pdx-form-field data-test="f1" label="Owner"><input class="pdx-input" /></pdx-form-field>
                    <pdx-form-field data-test="f2" label="Phone" horizontal><input class="pdx-input" /></pdx-form-field>
                    <pdx-form-field data-test="f3" label="Pet name"><input class="pdx-input" /></pdx-form-field>
                </div>`,
        },
        {
            // (d) Controls: a parent that already spaces its children keeps its own gap, not doubled.
            //     The two 1px divs after the fields measure the parent's gap in the same theme.
            id: 'form-field-in-form',
            title: 'Form Field — Direct children of pdx-form',
            html: `
                <div style="max-width: 420px;">
                    <pdx-form aria-label="Acceptance">
                        <pdx-form-field data-test="f1" label="Owner"><input class="pdx-input" /></pdx-form-field>
                        <pdx-form-field data-test="f2" label="Phone"><input class="pdx-input" /></pdx-form-field>
                        <div data-test="ra" style="height: 1px;"></div>
                        <div data-test="rb" style="height: 1px;"></div>
                    </pdx-form>
                </div>`,
        },
        {
            id: 'form-field-in-stack',
            title: 'Form Field — Children of pdx-stack gap="md"',
            html: `
                <pdx-stack gap="md" style="max-width: 420px;">
                    <pdx-form-field data-test="f1" label="Owner"><input class="pdx-input" /></pdx-form-field>
                    <pdx-form-field data-test="f2" label="Phone"><input class="pdx-input" /></pdx-form-field>
                    <div data-test="ra" style="height: 1px;"></div>
                    <div data-test="rb" style="height: 1px;"></div>
                </pdx-stack>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'form-field-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="field"] .pdx-form-field',
                        description: 'form-field is a vertical flex (column stack)',
                        display: { op: 'is', value: 'flex' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="field"] .pdx-field-label',
                        description: 'field label is rendered (has height)',
                        height: { op: '>', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="field"] .pdx-field-hint',
                        description: 'hint message is rendered (has height)',
                        height: { op: '>', value: 0 },
                    },
                ],
                // Composition: the label ABOVE the control, the control ABOVE the message (the hint).
                composition: [
                    {
                        description: 'label / control / hint are stacked vertically',
                        parent: 'section:not([hidden]) [data-test="field"] .pdx-form-field',
                        children: {
                            field: 'section:not([hidden]) [data-test="field"] .pdx-form-field',
                            label: 'section:not([hidden]) [data-test="field"] .pdx-field-label',
                            control: 'section:not([hidden]) [data-test="field"] [data-test="control"]',
                            hint: 'section:not([hidden]) [data-test="field"] .pdx-field-hint',
                        },
                        relations: [
                            {
                                description: 'label sits above the control',
                                left: 'label.bottom',
                                op: '<=',
                                right: 'control.top',
                                tolerance: 1,
                            },
                            {
                                description: 'control sits above the hint message',
                                left: 'control.bottom',
                                op: '<=',
                                right: 'hint.top',
                                tolerance: 1,
                            },
                            {
                                description: 'control is contained within the field box',
                                left: 'control',
                                op: 'contained-in',
                                right: 'field',
                            },
                        ],
                    },
                ],
            },
            'form-field-error': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="field"] .pdx-field-error',
                        description: 'error message is rendered when in error state',
                        height: { op: '>', value: 0 },
                    },
                ],
                // In the error state the cascade shows the error in the hint's place: the label above the control,
                // the control above the error message.
                composition: [
                    {
                        description: 'label / control / error are stacked vertically',
                        parent: 'section:not([hidden]) [data-test="field"] .pdx-form-field',
                        children: {
                            label: 'section:not([hidden]) [data-test="field"] .pdx-field-label',
                            control: 'section:not([hidden]) [data-test="field"] [data-test="control"]',
                            error: 'section:not([hidden]) [data-test="field"] .pdx-field-error',
                        },
                        relations: [
                            {
                                description: 'label sits above the control',
                                left: 'label.bottom',
                                op: '<=',
                                right: 'control.top',
                                tolerance: 1,
                            },
                            {
                                description: 'control sits above the error message',
                                left: 'control.bottom',
                                op: '<=',
                                right: 'error.top',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            // The field owns its vertical rhythm (--pdx-form-field-gap, space-md × density).
            'form-field-nested': {
                composition: [
                    {
                        description: 'fields in a plain div are spaced by the field itself',
                        parent: 'section:not([hidden]) [data-test="box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="box"]',
                            f1: 'section:not([hidden]) [data-test="f1"] > .pdx-form-field',
                            f2: 'section:not([hidden]) [data-test="f2"] > .pdx-form-field',
                            f3: 'section:not([hidden]) [data-test="f3"] > .pdx-form-field',
                        },
                        relations: [
                            { description: 'at least 12px between the first and the second field', left: 'f2.top - f1.bottom', op: '>=', right: '12', tolerance: 0 },
                            { description: 'at least 12px between the second (horizontal) and the third field', left: 'f3.top - f2.bottom', op: '>=', right: '12', tolerance: 0 },
                            { description: 'the last field adds no trailing space to its container', left: 'box.bottom', op: '==', right: 'f3.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
            'form-field-in-form': {
                composition: [
                    {
                        description: 'fields directly in pdx-form keep the form gap, not doubled',
                        parent: 'section:not([hidden]) pdx-form',
                        children: {
                            f1: 'section:not([hidden]) [data-test="f1"] > .pdx-form-field',
                            f2: 'section:not([hidden]) [data-test="f2"] > .pdx-form-field',
                            ra: 'section:not([hidden]) [data-test="ra"]',
                            rb: 'section:not([hidden]) [data-test="rb"]',
                        },
                        relations: [
                            { description: 'the gap between two fields equals the form gap', left: 'f2.top - f1.bottom', op: '==', right: 'rb.top - ra.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
            'form-field-in-stack': {
                composition: [
                    {
                        description: 'fields directly in pdx-stack gap="md" keep the stack gap, not doubled',
                        parent: 'section:not([hidden]) pdx-stack',
                        children: {
                            f1: 'section:not([hidden]) [data-test="f1"] > .pdx-form-field',
                            f2: 'section:not([hidden]) [data-test="f2"] > .pdx-form-field',
                            ra: 'section:not([hidden]) [data-test="ra"]',
                            rb: 'section:not([hidden]) [data-test="rb"]',
                        },
                        relations: [
                            { description: 'the gap between two fields equals the stack gap', left: 'f2.top - f1.bottom', op: '==', right: 'rb.top - ra.bottom', tolerance: 1 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // Both scenarios: the basic one checks the bound label plus the describedby(hint); the error one
        // also checks aria-invalid plus the describedby(error). If the label↔input association were missing,
        // axe would report the "label" / "form field has multiple labels" rule.
        scenarios: ['form-field-basic', 'form-field-error'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'form-field-basic',
        targets: [
            // A content-driven container: height = the sum of label + input + hint, sensitive to
            // the host's font and line-height poisoned by the hostile CSS → skipHeight (as for card and dialog).
            // The wrapper has no radius or border of its own (.pdx-form-field has none): it asserts only
            // the width's integrity, which the runner checks by default.
            { selector: 'section:not([hidden]) [data-test="field"] .pdx-form-field', skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    keyboard: {
        // The form-field is not an interactive widget of its own: the focus goes to the slotted control.
        // Tab must take the focus to the slotted input (bound through label/for).
        scenario: 'form-field-basic',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="field"] [data-test="control"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // Two scenarios: the normal state (label and hint) and the error state (a red label plus the error message) — the
    // difference in colour and state is not caught by the maths.
    visual: {
        scenarios: ['form-field-basic', 'form-field-error'],
    },
};

export default formField;
