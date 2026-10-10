/**
 * MANIFEST — pdx-inline-edit
 *
 * Edit in place: in display mode it shows the formatted value (clickable), and in edit mode it
 * replaces the display with the editor for the type (here type="text" → an <input>).
 *
 * SOURCE: packages/ui/src/inline-edit/pdx-inline-edit.ts
 * CSS:      packages/design/src/components/inline-edit.css
 *
 * ── DOM structure (built in a requestAnimationFrame, then filled by ctx.track) ──
 *   host <pdx-inline-edit>
 *     └── div.pdx-inline-edit[data-type=<type>]             (root, + .editing/.disabled/.readonly)
 *           The type is an attribute: as a class, `pdx-inline-edit-text`/`-textarea` would be the classes
 *           of the inner span and <textarea>, and their styles would end up on the root.
 *           ├── div.pdx-inline-edit-display[role=button][tabindex=0]   (visible while NOT editing)
 *           │     ├── span.pdx-inline-edit-text(.empty)                (the formatted text)
 *           │     └── span.pdx-inline-edit-icon[aria-hidden=true]      (✎, when showIcon && !disabled && !readonly)
 *           └── div.pdx-inline-edit-editor                            (display:none while NOT editing)
 *                 └── (in edit, type=text) input.pdx-inline-edit-input
 *
 * Note: the DOM is built in an rAF plus a second ctx.track on the _domReady flag. The scenario
 * runners already wait (waitForTimeout) before measuring, as they do for card and dialog.
 *
 * ── How edit mode is entered ──
 *  - There is no `editing` or `open` prop: editing starts through an interaction
 *    (a click on the display with editOn='click', the default; Enter or Space on the role=button display)
 *    or by calling the method EXPOSED on ctx.el: `startEdit()` (the setup returns
 *    { startEdit, confirmEdit, cancelEdit }).
 *  - The `inline-edit-editing` scenario uses a `setup` to call host.startEdit()
 *    DETERMINISTICALLY, so the measurement and axe run on the input in a fixed state.
 *
 * ── DETERMINISMO ──
 *  - A FIXED value, "Editable text", type="text", saveOn="blur" (the default), to avoid action buttons.
 *  - showIcon is left at its default (true) in the display scenario; the icon is aria-hidden.
 *
 * ── Universal contracts (no theme-specific px) ──
 *  - display: cursor pointer, role=button, a sensible min-height (>=24; the CSS sets 28).
 *  - root inline-block (display oneOf inline-flex/inline-block/flex/block — safe across themes).
 *  - edit: the editor input is there and its width is > 0.
 *
 * ── The editor's accessible name ──
 *  The editor (input, textarea, date, datetime) built by buildEditor carries an aria-label: with no
 *  <label>, no aria-label and no placeholder, axe reports `label` (WCAG 4.1.2 / 1.3.1) on the edit
 *  scenario, which is why both the display and the edit scenario are in a11y.scenarios.
 *
 * The display, on the other hand, is properly keyboard-operable (role=button + tabindex=0 plus a
 * keydown handler for Enter and Space → startEdit), pdx-inline-edit.ts:385-396. No bug there.
 */
import type { ComponentManifest } from './_types';

export const inlineEdit: ComponentManifest = {
    name: 'inline-edit',
    tag: 'pdx-inline-edit',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/inline-edit'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'inline-edit-display',
            title: 'Inline Edit — Display (text)',
            html: `
                <div style="max-width: 360px;">
                    <pdx-inline-edit data-test="ie" type="text" value="Editable text"></pdx-inline-edit>
                </div>`,
        },
        {
            // The root of type="textarea" must not carry the editor <textarea>'s class, or in
            // display mode it draws a focused field (a border, a ring, a 60px minimum height).
            id: 'inline-edit-textarea-display',
            title: 'Inline Edit — Display (textarea)',
            html: `
                <div style="max-width: 360px;">
                    <pdx-inline-edit data-test="ie" type="textarea" value="Two lines of notes"></pdx-inline-edit>
                </div>`,
        },
        {
            id: 'inline-edit-readonly',
            title: 'Inline Edit — Readonly',
            html: `
                <div style="max-width: 360px;">
                    <pdx-inline-edit data-test="ie" type="text" value="Editable text" readonly></pdx-inline-edit>
                </div>`,
        },
        {
            id: 'inline-edit-disabled',
            title: 'Inline Edit — Disabled',
            html: `
                <div style="max-width: 360px;">
                    <pdx-inline-edit data-test="ie" type="text" value="Editable text" disabled></pdx-inline-edit>
                </div>`,
        },
        {
            id: 'inline-edit-editing',
            title: 'Inline Edit — Editing (text input visible)',
            html: `
                <div style="max-width: 360px;">
                    <pdx-inline-edit data-test="ie" type="text" value="Editable text"></pdx-inline-edit>
                </div>`,
            // It enters edit mode deterministically through a method exposed on ctx.el.
            // The DOM and the methods are ready after the build rAF → it retries until startEdit exists.
            setup: `
                (function () {
                    const host = document.querySelector('section:not([hidden]) [data-test="ie"]');
                    let tries = 0;
                    (function attempt() {
                        if (host && typeof host.startEdit === 'function' && host.querySelector('.pdx-inline-edit-display')) {
                            host.startEdit();
                        } else if (tries++ < 30) {
                            requestAnimationFrame(attempt);
                        }
                    })();
                })();
            `,
        },
    ],

    // ── Dim. 1: the mathematical contract ──
    contracts: {
        scenarios: {
            'inline-edit-display': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display',
                        description: 'display is clickable (cursor pointer)',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display',
                        description: 'display is tall enough to be a touch/click target',
                        height: { op: '>=', value: 24 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display',
                        description: 'display has non-negative border radius (metro/cyberpunk may zero it)',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // The formatted text must be visible and contained in the display.
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-text',
                        description: 'formatted value text is rendered with width',
                        width: { op: '>', value: 0 },
                    },
                    {
                        // The root must not take overflow:hidden from the value's span: in edit mode
                        // it would cut the input's focus ring.
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit',
                        description: 'the root does not clip (the editor focus ring shows)',
                        overflow: { op: 'is', value: 'visible' },
                    },
                ],
                // The text is contained in the display's box (no horizontal overflow on the right).
                composition: [
                    {
                        description: 'display text is contained within the display box',
                        parent: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display',
                        children: {
                            display: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display',
                            text: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-text',
                        },
                        relations: [
                            { description: 'text within display', left: 'text', op: 'contained-in', right: 'display' },
                            {
                                description: 'text right edge does not overflow display right edge',
                                left: 'text.right',
                                op: '<=',
                                right: 'display.right',
                                tolerance: 1,
                            },
                        ],
                    },
                ],
            },
            'inline-edit-textarea-display': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit',
                        description: 'textarea root in display mode draws no field border',
                        border: { all: { width: { op: '==', value: 0 } } },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit',
                        description: 'textarea root in display mode draws no focus ring',
                        boxShadow: { op: 'is', value: 'none' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit',
                        description: 'textarea root in display mode has no editor min-height',
                        minHeight: { op: '<', value: 60 },
                    },
                ],
            },
            'inline-edit-disabled': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit',
                        description: 'disabled inline-edit has reduced opacity',
                        opacity: { op: '<', value: 1 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit',
                        description: 'disabled inline-edit disables pointer events',
                        pointerEvents: { op: 'is', value: 'none' },
                    },
                ],
            },
            'inline-edit-readonly': {
                standalone: [
                    {
                        // While readonly the display must not suggest it is editable (the default cursor).
                        selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display',
                        description: 'readonly display uses default cursor (not editable)',
                        cursor: { op: 'is', value: 'default' },
                    },
                ],
            },
            'inline-edit-editing': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] input.pdx-inline-edit-input',
                        description: 'edit mode renders a text input',
                        width: { op: '>', value: 0 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="ie"] input.pdx-inline-edit-input',
                        description: 'edit input is tall enough to be usable',
                        height: { op: '>=', value: 20 },
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    // Both scenarios: the display is a role=button named by its text; the editor (input/textarea/
    // date/number) gets an aria-label (without an accessible name → axe's label rule).
    a11y: {
        scenarios: ['inline-edit-display', 'inline-edit-editing'],
    },

    // ── Dim. 3: style isolation ──
    // A content-driven display: under hostile CSS the font/line-height change and the height follows
    // (a legitimate reflow, not a containment failure). Skip the height; the radius and border stay
    // asserted as the real immunity guarantee (as for card and dialog).
    isolation: {
        scenario: 'inline-edit-display',
        targets: [
            { selector: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // The display is a focusable role=button (tabindex=0). Tab → focus; Enter enters edit mode
    // (the keydown handler for Enter and Space → startEdit), and the expectation is that the root gains the .editing class.
    // Escape cancels and the focus returns to the display, not to <body>.
    keyboard: {
        scenario: 'inline-edit-display',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display' },
            { key: 'Enter', expectFocus: 'section:not([hidden]) [data-test="ie"] input.pdx-inline-edit-input' },
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="ie"] .pdx-inline-edit-display' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // The textarea in display mode: it must not be drawn as a focused field.
    visual: {
        scenarios: ['inline-edit-display', 'inline-edit-editing', 'inline-edit-textarea-display'],
        // The editor's input shows a blinking caret (input.focus() in edit mode) → masked.
        mask: ['section:not([hidden]) [data-test="ie"] input.pdx-inline-edit-input'],
    },
};

export default inlineEdit;
