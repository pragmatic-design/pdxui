/**
 * MANIFEST — pdx-form-actions
 *
 * The component: an action bar for a form (submit/reset). The tag is `pdx-form-actions`.
 * Export OK in packages/ui/package.json (`"./form-actions"`) + import in
 * packages/ui/src/index.ts (`import './form-actions/pdx-form-actions';`). Registrazione COMPLETA.
 *
 * ── Source: packages/ui/src/form-actions/pdx-form-actions.ts ──
 *   render() = an INNER <div :class="wrapClass"> holding a <slot>:
 *     - wrapClass() = `pdx-form-actions` + (align ? ` pdx-form-actions-${align}` : '')   (lines 33-38)
 *     - the <slot> (lines 59-73) has a FALLBACK: reset (<button type="reset" class="pdx-ghost">) plus
 *       submit (<button type="submit" class="pdx-primary">). The fallback is used ONLY when
 *       no child is slotted. If the developer slots their own buttons, those REPLACE the fallback
 *       and become direct children of the inner <div class="pdx-form-actions"> (light DOM).
 *   Props:
 *     - submitLabel / resetLabel (String) → the labels of the FALLBACK buttons (resetLabel="none" hides the reset).
 *     - align (String, default 'end') → the real values: 'start' | 'center' | 'end' | 'between'
 *       (⚠ NOT 'left'/'right': the source and the CSS use start/center/end/between.)
 *     - showLoading (Boolean, true by default) → a spinner on the fallback submit while form.submitting().
 *   Events: NONE emitted by the component. The actions happen through native <button type="submit|reset">
 *     elements, which the browser propagates to the hosting <form>. The fallback reset calls form.reset().
 *   role/ARIA: NO explicit role, on the host or on the inner div. It is a pure flex container.
 *     Accessibility comes from the native <button>s (an accessible name from their text).
 *   Keyboard: NO handler. The children are native <button>s → natively tabbable → pattern 'none'.
 *
 * ── CSS: packages/design/src/components/form.css (lines 10-22) ──
 *   .pdx-form-actions            → display:flex; gap:sm; padding-top:md; border-top:1px solid; margin-top:md
 *   .pdx-form-actions-start      → justify-content: flex-start
 *   .pdx-form-actions-center     → justify-content: center
 *   .pdx-form-actions-end        → justify-content: flex-end
 *   .pdx-form-actions-between    → justify-content: space-between
 *   A stable geometry across themes: no media query, no theme-specific px in the invariants.
 *
 * ── Testing choices ──
 *   One scenario: 2 slotted buttons (Cancel + Submit) with align="end" (the default, and the canonical
 *   "actions on the right" use case). The slotted buttons use design-system classes (pdx-ghost / pdx-primary).
 *   The INNER <div class="pdx-form-actions"> is targeted through [data-test="actions"] (on the host), descending
 *   to the class, because the flex geometry lives on the inner div, not on the custom element host.
 *
 *   Universal contracts (true on all 13 themes, NO theme-specific px):
 *     - standalone: the container is display:flex; its height is measurable (>0).
 *     - composition: the two buttons are contained in the inner div; on the same row (the same top);
 *       their order is preserved (Cancel.left < Submit.left = the source order); with align=end the trailing
 *       button (Submit) is pushed towards the right edge (Submit.right near container.right).
 *   a11y: the buttons have text → an accessible name; a pure flex container, no missing role.
 *   isolation: skipHeight (a content-driven height: it depends on the host's font and line-height for the buttons).
 *   keyboard: 'none' (native tabbable buttons, no roving and no arrows in the source).
 *   visual: 1 scenario.
 *
 * REAL BUGS: none. The `align` API takes start/center/end/between and the CSS implements all
 *   four classes → they agree. (A note: the task assumed 'left'/'right' values that do not exist.)
 */
import type { ComponentManifest } from './_types';

export const formActions: ComponentManifest = {
    name: 'form-actions',
    tag: 'pdx-form-actions',
    tier: '2',
    status: 'wip',
    imports: ['@pdxui/ui/form-actions'],

    // ── Scenarios ──
    // 2 slotted buttons (Cancel + Submit) plus align="end". A wide, fixed container so that with align:flex-end
    // there is horizontal surplus and the trailing button really is pushed right (across themes and fonts).
    scenarios: [
        {
            id: 'form-actions-end',
            title: 'Form actions — slotted buttons, align end',
            html: `
                <div style="width: 600px; max-width: 100%;">
                    <pdx-form-actions data-test="actions" align="end">
                        <button type="button" class="pdx-ghost" data-test="fa-cancel">Cancel</button>
                        <button type="submit" class="pdx-primary" data-test="fa-submit">Submit</button>
                    </pdx-form-actions>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'form-actions-end': {
                standalone: [
                    {
                        // The inner div is the flex container (the geometry lives here, not on the host).
                        selector: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions',
                        description: 'form-actions container renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // It holds two buttons → a measurable height.
                        selector: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions',
                        description: 'form-actions container has a measurable height',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
// Containment: both buttons sit INSIDE the inner flex container.
                        description: 'slotted buttons are contained within the form-actions box',
                        parent: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions',
                        children: {
                            container: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions',
                            cancel: 'section:not([hidden]) [data-test="fa-cancel"]',
                            submit: 'section:not([hidden]) [data-test="fa-submit"]',
                        },
                        relations: [
                            { description: 'cancel within container', left: 'cancel', op: 'contained-in', right: 'container' },
                            { description: 'submit within container', left: 'submit', op: 'contained-in', right: 'container' },
                            {
                                description: 'submit right edge does not overflow container right edge',
                                left: 'submit.right',
                                op: '<=',
                                right: 'container.right',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // The same row, and the source order preserved: Cancel comes before Submit (cancel.left < submit.left)
                        // and the two share their top (a flex row; no wrap is expected with the wide container).
                        description: 'buttons share the same row and preserve source order',
                        parent: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions',
                        children: {
                            cancel: 'section:not([hidden]) [data-test="fa-cancel"]',
                            submit: 'section:not([hidden]) [data-test="fa-submit"]',
                        },
                        relations: [
                            { description: 'cancel.top == submit.top (same row)', left: 'cancel.top', op: '==', right: 'submit.top', tolerance: 3 },
                            { description: 'cancel.left < submit.left (Cancel before Submit)', left: 'cancel.left', op: '<', right: 'submit.left' },
                        ],
                    },
                    {
                        // align=end (justify-content:flex-end): the block of buttons is pushed towards the right
                        // edge → the trailing button (Submit) is near the container's right, and there is a gap on the
                        // left (cancel.left beyond the container's left). The alignment's geometric invariant.
                        description: 'align=end pushes the button block to the right edge',
                        parent: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions',
                        children: {
                            container: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions',
                            cancel: 'section:not([hidden]) [data-test="fa-cancel"]',
                            submit: 'section:not([hidden]) [data-test="fa-submit"]',
                        },
                        relations: [
                            {
                                description: 'submit right edge is near the container right edge',
                                left: 'submit.right',
                                op: '>=',
                                right: 'container.right',
                                // It tolerates the container's padding-right (absent here, but it keeps the rule robust across themes).
                                tolerance: 16,
                            },
                            {
                                description: 'left gap exists: cancel.left is right of the container left edge',
                                left: 'cancel.left',
                                op: '>',
                                right: 'container.left',
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A pure flex container (no role). The two <button>s have text → an accessible name.
    // No known false positive → no disableRules.
    a11y: {
        scenarios: ['form-actions-end'],
    },

    // ── Dim. 3: style isolation ──
    // skipHeight: the inner div's height is content-driven (it follows the host's font and line-height for the buttons),
    // not a clean structural invariant across platforms. The width stays asserted as the immunity
    // guarantee (the container is display:flex, and its width is the parent's full 600px row).
    isolation: {
        scenario: 'form-actions-end',
        targets: [
            { selector: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // Pattern 'none': there is no keydown handler in the source. The slotted children are native <button>s →
    // Tab walks them one by one. All we check is that Tab enters the container.
    keyboard: {
        scenario: 'form-actions-end',
        steps: [
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions' },
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="actions"] .pdx-form-actions' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['form-actions-end'],
    },
};

export default formActions;
