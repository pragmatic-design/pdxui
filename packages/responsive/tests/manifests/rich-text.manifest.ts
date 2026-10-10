/**
 * MANIFEST — pdx-rich-text
 *
 * The component: a zero-dependency WYSIWYG editor (a doc model → a DOM projection).
 *
 * ── DOM STRUCTURE (built IMPERATIVELY in an rAF, NOT in the render) ──
 *
 *   The custom element's render() is only `<slot></slot>`. The real structure is created inside
 *   ctx.track()→requestAnimationFrame (pdx-rich-text.ts:62-166): which is why the scenarios
 *   measure AFTER the mount (the runner waits for networkidle plus a timeout, as for card and toolbar).
 *
 *   HOST <pdx-rich-text>                       → the class .pdx-rich-text, added in an rAF (ts:79)
 *     │  CSS: display:flex; flex-direction:column; border; radius-md (rich-text.css:3-10)
 *     │  → the toolbar (when it is on top) sits ABOVE the editable area (a column).
 *     │
 *     ├─ <div.pdx-rt-toolbar role="toolbar" aria-label="Text formatting">   (toolbar.ts:110-113)
 *     │     · created ONLY when toolbarMode==='top' && toolbar!=='false' (ts:92-95). 'standard' by default.
 *     │     · CSS: display:flex; align-items:center; min-height:36px; border-bottom (rich-text.css:19-28)
 *     │     ├─ <div.pdx-rt-toolbar-group>          (toolbar.ts:122-123)  display:flex (css:30-34)
 *     │     │    └─ <button.pdx-rt-toolbar-btn      (toolbar.ts:135-137)  28x28 (css:43-48)
 *     │     │          type=button
 *     │     │          title / aria-label = rich-text.<name> string + shortcut, e.g. "Bold (Ctrl+B)"
 *     │     │          tabindex: 0 on the first button, -1 on the others (roving)
 *     │     │          aria-pressed="false"  ⚠ set ONLY by updateToolbarState (toolbar.ts:173),
 *     │     │                                   which runs on the doc's onUpdate, NOT on the initial render
 *     │     │                                   → at mount the buttons do NOT have aria-pressed yet.
 *     │     │       > <pdx-icon name="bold" size="16">  (icon-only: no text → the label comes from aria-label)
 *     │     ├─ <div.pdx-rt-toolbar-sep>             (a separator between groups, toolbar.ts:117-119)
 *     │     └─ … other groups and buttons (the 'standard' preset: bold italic underline | heading list | …)
 *     │
 *     └─ <div.pdx-rt-wrapper>                       (ts:82-83)  min-height:120px (css:80-84)
 *           └─ <div.pdx-rt-editor>                  (view.ts:57-58, = config.element = wrapper? NO:
 *                                                     EditorView creates its own .pdx-rt-content inside
 *                                                     `element`=wrapper; this.dom===wrapper gets
 *                                                     .pdx-rt-editor, view.ts:57-59)
 *                 └─ <div.pdx-rt-content            (view.ts:61-76)
 *                       contenteditable="true"
 *                       role="textbox"
 *                       aria-multiline="true"
 *                       spellcheck="true">
 *                       padding md/lg; min-height:100% (css:86-97)
 *                       the content = the doc's projection (<p>Hello world</p>, say)
 *
 *   A note on .pdx-rt-editor vs the wrapper: EditorView receives `element: wrapper` (ts:100-101) and calls
 *   `this.dom = config.element`, then `this.dom.classList.add('pdx-rt-editor')` (view.ts:57-59).
 *   So the SAME div carries both classes: `.pdx-rt-wrapper.pdx-rt-editor`. The
 *   `.pdx-rt-content` is its only child. The selectors below use `.pdx-rt-content`
 *   (the real textbox) and `.pdx-rt-toolbar` (the real toolbar), both names VERIFIED in the source.
 *
 * ── DETERMINISM (a critical rule) ──
 *
 *   1. A FIXED `value`: a doc JSON with a single "Hello world" paragraph is passed.
 *      The `value` prop is `type: Object` (ts:17) and parseValue accepts a JSONNode (ts:50-59).
 *      The doc model's shape: { type:'doc', content:[{type:'paragraph', content:[{type:'text', text:…}]}] }.
 *      It is passed as a JSON-string ATTRIBUTE: the runtime's setProp parses it → an object.
 *      Stable content = no random layout reflow.
 *   2. THE BLINKING CARET: the .pdx-rt-content area is contenteditable → the cursor blinks and,
 *      on focus or selection, the browser draws the caret. In the visual dimension it is MASKED entirely
 *      (`mask: ['…pdx-rt-content']`), to avoid a non-deterministic diff.
 *   3. NO autofocus (false by default, ts:25) → the editor does not steal the focus on load: the initial
 *      state is stable and repeatable.
 *   4. toolbarMode defaults to 'top' and toolbar to 'standard' → the toolbar IS there without
 *      passing props; the 'minimal' preset (bold italic code) is used, to cut the number
 *      of buttons and external icons (pdx-icon) and keep the scenario lean and stable.
 *
 * ── CONTRACTS: universal on all 13 themes (NO theme-specific px) ──
 *   - the container is display flex (a column): a CSS invariant, not theme-specific.
 *   - the toolbar is there with role=toolbar and a noticeable height (min-height:36px → >=20, conservative).
 *   - area editabile dimensionata (wrapper min-height:120px → height >=80 conservativo cross-font).
 *   - composition: the toolbar ABOVE the area (toolbar.bottom <= content.top), the buttons aligned on one
 *     row in the toolbar (the same top), the area contained in the host.
 *
 * ── A REAL BUG (NOT fixed, written down) ──
 *   The contenteditable area has role="textbox" (view.ts:64) but NO accessible name:
 *   neither aria-label nor aria-labelledby is ever set. The `placeholder` prop produces only
 *   a data-placeholder for a CSS pseudo-element (ts:138, css:102-108) → that is NOT an accessible
 *   name. axe-core flags it with the "aria-input-field-name" rule (WCAG 4.1.2).
 *   So the a11y block below does NOT list the scenario among those axe scans as "expected
 *   clean"; it is included anyway BUT with a documented disableRules, so the system catches the
 *   regression the day the fix lands (see the a11y note). The proposed fix is in the report.
 */
import type { ComponentManifest } from './_types';

// A deterministic JSON doc model: a single "Hello world" paragraph.
// Passed as a JSON-string attribute (the `value` prop is type:Object → the runtime parses it).
const VALUE = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
}).replace(/"/g, '&quot;');

export const richText: ComponentManifest = {
    name: 'rich-text',
    tag: 'pdx-rich-text',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/rich-text'],

    // ── Scenarios ──
    // A fixed-width wrapper (560px), to guarantee the toolbar stable horizontal room
    // (the 28x28 buttons plus the icons stay on one row). The 'minimal' preset = bold italic code (3 buttons),
    // to cut the dependency on external pdx-icons and keep the measurement lean. A FIXED value (see above).
    scenarios: [
        {
            id: 'rich-text-basic',
            title: 'Rich text — toolbar (top) + contenteditable editor',
            html: `
                <div style="width: 560px; max-width: 100%;">
                    <pdx-rich-text
                        data-test="rt"
                        toolbar="minimal"
                        value="${VALUE}"
                        aria-label="Article body"
                    ></pdx-rich-text>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'rich-text-basic': {
                standalone: [
                    {
                        // Host: a column layout (toolbar above, editor below).
                        selector: 'section:not([hidden]) [data-test="rt"]',
                        description: 'rich-text host renders as a (column) flex container',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // Host: a measurable height (toolbar min 36px + wrapper min 120px).
                        selector: 'section:not([hidden]) [data-test="rt"]',
                        description: 'rich-text host has a measurable height (toolbar + editor)',
                        height: { op: '>=', value: 120 },
                    },
                    {
                        // The toolbar is there and has a height (min-height:36px → >=20, conservative).
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar',
                        description: 'toolbar is present with a measurable height',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        // The toolbar is a flex container (a row of buttons).
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar',
                        description: 'toolbar renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // Area editabile dimensionata (wrapper min-height:120px → conservativo >=80
                        // to absorb the font and line-height differences across themes).
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-content',
                        description: 'editable content area has a usable height',
                        height: { op: '>=', value: 80 },
                    },
                    {
                        // The editable area takes the component's full width.
                        selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-content',
                        description: 'editable content area has a measurable width',
                        width: { op: '>', value: 100 },
                    },
                ],
                composition: [
                    {
                        // The toolbar sits ABOVE the editable area (flex-direction:column).
                        description: 'toolbar sits above the editable content area',
                        parent: 'section:not([hidden]) [data-test="rt"]',
                        children: {
                            toolbar: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar',
                            content: 'section:not([hidden]) [data-test="rt"] .pdx-rt-content',
                        },
                        relations: [
                            {
                                description: 'toolbar.bottom <= content.top (toolbar stacked above editor)',
                                left: 'toolbar.bottom',
                                op: '<=',
                                right: 'content.top',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // The editable area is contained in the host (no geometric overflow).
                        description: 'editable content area is contained within the host',
                        parent: 'section:not([hidden]) [data-test="rt"]',
                        children: {
                            host: 'section:not([hidden]) [data-test="rt"]',
                            content: 'section:not([hidden]) [data-test="rt"] .pdx-rt-content',
                        },
                        relations: [
                            { description: 'content within host', left: 'content', op: 'contained-in', right: 'host' },
                        ],
                    },
                    {
                        // The format buttons are aligned on the toolbar's row
                        // (align-items:center, one row). The first two buttons are compared.
                        description: 'toolbar format buttons are aligned on the same row',
                        parent: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar',
                        children: {
                            toolbar: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar',
                            first: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar-btn:nth-of-type(1)',
                            second: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar-btn:nth-of-type(2)',
                        },
                        relations: [
                            { description: 'first button within toolbar', left: 'first', op: 'contained-in', right: 'toolbar' },
                            { description: 'buttons share the same top (single row)', left: 'first.top', op: '==', right: 'second.top', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="toolbar"+aria-label are fine. The buttons are icon-only but they have aria-labels (toolbar.ts:140) → fine.
    // .pdx-rt-content is a role=textbox, so it needs a name: pdx-rich-text sets aria-label
    // on it (from label/placeholder, falling back to 'Rich text editor'). No disableRule.
    a11y: {
        scenarios: ['rich-text-basic'],
    },

    // ── Dim. 3: style isolation ──
    // The target is the editable area: it has a geometric box (a full width, a fixed padding) → the width and radius drift
    // are measurable under hostile CSS. skipHeight: its height is CONTENT-DRIVEN (the min-height plus the sum of the
    // content, sensitive to the host's line-height) → not a clean invariant across platforms.
    // The width stays asserted as the immunity guarantee.
    isolation: {
        scenario: 'rich-text-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="rt"] .pdx-rt-content', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard ──
    // The toolbar is a WAI-ARIA toolbar: one tab stop on its first button, arrows and
    // Home/End inside it, and the next Tab leaves into the editing area. With every button at
    // tabindex -1, Tab would go straight to the text and the toolbar would be mouse-only.
    // Then out of the text both ways: an editor that swallows every Tab and Shift+Tab, in a
    // list or not, traps the focus. Shift+Tab goes back to the toolbar's tab stop; Tab leaves the
    // element (nothing on the page follows it, so focus falls to the body).
    keyboard: {
        scenario: 'rich-text-basic',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar-btn[data-command="toggleBold"]' },
            { key: 'ArrowRight', expectFocus: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar-btn[data-command="toggleItalic"]' },
            { key: 'End', expectFocus: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar-btn[data-command="toggleCode"]' },
            { key: 'ArrowRight', expectFocus: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar-btn[data-command="toggleBold"]' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="rt"] .pdx-rt-content' },
            { key: 'Shift+Tab', expectFocus: 'section:not([hidden]) [data-test="rt"] .pdx-rt-toolbar-btn[data-command="toggleBold"]' },
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="rt"] .pdx-rt-content' },
            { key: 'Tab', expectFocus: 'body' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: the whole layout (the toolbar plus the editor with fixed content) per theme.
    // A MASK on the editable area: the contenteditable caret blinks → not deterministic.
    visual: {
        scenarios: ['rich-text-basic'],
        mask: ['section:not([hidden]) [data-test="rt"] .pdx-rt-content'],
    },
};

export default richText;
