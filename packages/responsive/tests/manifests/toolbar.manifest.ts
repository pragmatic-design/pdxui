/**
 * MANIFEST — pdx-toolbar
 *
 * Contracts DERIVED by inspecting the source + CSS:
 *
 *   - Source: packages/ui/src/toolbar/pdx-toolbar.ts
 *       · render() = <slot></slot>: the children (native buttons, separators, spacers, groups)
 *         are projected as direct children of the <pdx-toolbar> HOST (light DOM).
 *       · In a rAF the host receives: the class `.pdx-toolbar`, role="toolbar", aria-label = the `label` prop
 *         (default the toolbar.label string, "Toolbar"), aria-orientation="vertical" when vertical.
 *       · Boolean props → classes toggled on the host:
 *           compact   → .pdx-toolbar-compact
 *           bordered  → .pdx-toolbar-bordered
 *           vertical  → .pdx-toolbar-vertical   (see the vertical toolbar below)
 *       · WAI-ARIA toolbar: ONE tab stop (roving tabindex through focusGroup over the controls
 *         it finds — the inner <button> of a pdx-button, the trigger of a pdx-select), ←/→ (↑/↓ when
 *         vertical), Home/End between the controls. A control that uses those keys (a text field, a select) keeps them.
 *
 *   - CSS: packages/design/src/components/toolbar.css
 *       · `.pdx-toolbar { display:flex; align-items:center; gap; padding; flex-wrap:nowrap }`
 *         → ALWAYS horizontal (a row). No media query, geometry stable across themes.
 *       · `.pdx-toolbar-bordered` → background + border (border-width solid) + border-radius md.
 *       · `.pdx-toolbar-sep` → width:1px; height:1.2rem (a vertical separator).
 *       · `.pdx-toolbar-spacer` → flex:1 (it pushes the rest to the right).
 *       · `.pdx-toolbar-group` → display:inline-flex; gap:0; the inner buttons have joined
 *         radii (first one left, last one right, middles 0) and a negative margin-left (flush).
 *
 * The vertical toolbar:
 *   The `vertical` prop adds `.pdx-toolbar-vertical` to the host (pdx-toolbar.ts:35), and
 *   packages/design/src/components/toolbar.css implements it (flex-direction:column;
 *   align-items:stretch) + rotated separators; without that rule the prop is inert and the
 *   toolbar stays horizontal. The scenario `toolbar-vertical` below catches the regression
 *   (items stacked in a column).
 *
 * Contracts kept CONSERVATIVE but true in all 13 themes: NO theme-specific px.
 *   - display flex and height>=0 are invariants of the container.
 *   - separator and spacer as geometric children INSIDE the toolbar (row alignment).
 *   - bordered: border-width >= 0 and radius >= 0 (metro/cyberpunk zero the radius).
 *   - the group's buttons aligned on the same row (the same top) → a geometric invariant.
 */
import type { ComponentManifest } from './_types';

export const toolbar: ComponentManifest = {
    name: 'toolbar',
    tag: 'pdx-toolbar',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/toolbar'],

    // ── Scenarios ──
    // The real HTML: several native buttons, a separator, a spacer, a joined group, and a
    // primary action pushed to the right by the spacer. It is the canonical usage pattern (see the
    // comment at the top of toolbar.css). The buttons use design system classes.
    scenarios: [
        {
            id: 'toolbar-basic',
            title: 'Toolbar — buttons, separator, group, spacer',
            // A WIDE, fixed container (900px): it guarantees horizontal surplus so the flex:1 spacer
            // stays > 0 even with the most generous fonts/padding (cupertino SF Pro, material Roboto).
            html: `
                <div style="width: 900px; max-width: 100%;">
                    <pdx-toolbar data-test="toolbar">
                        <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tb-bold">Bold</button>
                        <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tb-italic">Italic</button>
                        <span class="pdx-toolbar-sep" data-test="tb-sep"></span>
                        <span class="pdx-toolbar-group" data-test="tb-group">
                            <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tb-left">Left</button>
                            <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tb-center">Center</button>
                            <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tb-right">Right</button>
                        </span>
                        <span class="pdx-toolbar-spacer" data-test="tb-spacer"></span>
                        <button type="button" class="pdx-primary pdx-btn-sm" data-test="tb-save">Save</button>
                    </pdx-toolbar>
                </div>`,
        },
        {
            id: 'toolbar-bordered',
            title: 'Toolbar — bordered variant',
            html: `
                <div style="max-width: 640px;">
                    <pdx-toolbar data-test="toolbar-bordered" bordered>
                        <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tbb-a">One</button>
                        <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tbb-b">Two</button>
                    </pdx-toolbar>
                </div>`,
        },
        {
            // Icon-only buttons: the name is each one's aria-label (axe button-name demands it), the
            // toolbar's is its `label`.
            id: 'toolbar-icons',
            title: 'Toolbar — named, with icon-only buttons',
            html: `
                <div style="max-width: 640px;">
                    <pdx-toolbar data-test="toolbar-icons" label="Row actions" bordered>
                        <button type="button" class="pdx-ghost pdx-btn-sm" aria-label="Edit" data-test="tbi-edit"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16z" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
                        <button type="button" class="pdx-ghost pdx-btn-sm" aria-label="Copy" data-test="tbi-copy"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
                        <button type="button" class="pdx-ghost pdx-btn-sm" aria-label="Delete" data-test="tbi-delete"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24"><path d="M5 7h14M9 7v12h6V7" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
                    </pdx-toolbar>
                </div>`,
        },
        {
            id: 'toolbar-vertical',
            title: 'Toolbar — vertical orientation',
            html: `
                <div style="max-width: 320px;">
                    <pdx-toolbar data-test="toolbar-vertical" vertical bordered>
                        <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tbv-top">Top</button>
                        <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tbv-bottom">Bottom</button>
                    </pdx-toolbar>
                </div>`,
        },
        {
            // Seven controls in 200px. A toolbar that keeps one row leaves the controls past the edge,
            // on a phone, cut off by the page's overflow-x: clip, with no way to reach them.
            id: 'toolbar-narrow',
            title: 'Toolbar — more controls than the box is wide',
            html: `
                <div data-test="tbn-box" style="width: 200px;">
                    <pdx-toolbar data-test="toolbar-narrow" label="Formatting" bordered>
                        <button type="button" class="pdx-ghost pdx-btn-sm" data-test="tbn-first">Bold</button>
                        <button type="button" class="pdx-ghost pdx-btn-sm">Italic</button>
                        <button type="button" class="pdx-ghost pdx-btn-sm">Underline</button>
                        <span class="pdx-toolbar-sep"></span>
                        <button type="button" class="pdx-ghost pdx-btn-sm">Left</button>
                        <button type="button" class="pdx-ghost pdx-btn-sm">Center</button>
                        <button type="button" class="pdx-ghost pdx-btn-sm">Right</button>
                        <button type="button" class="pdx-primary pdx-btn-sm" data-test="tbn-last">Save</button>
                    </pdx-toolbar>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'toolbar-basic': {
                standalone: [
                    {
                        // Container: display flex (a row of actions).
                        selector: 'section:not([hidden]) [data-test="toolbar"]',
                        description: 'toolbar host renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The host has role="toolbar" → appreciable height (it holds sm buttons, ~28px).
                        selector: 'section:not([hidden]) [data-test="toolbar"]',
                        description: 'toolbar has a measurable height',
                        height: { op: '>=', value: 20 },
                    },
                    {
                        // Spacer: flex:1 → it takes space (width > 0), pushing Save to the right.
                        selector: 'section:not([hidden]) [data-test="toolbar"] [data-test="tb-spacer"]',
                        description: 'spacer takes up horizontal space (flex:1)',
                        width: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // The separator and every button sit INSIDE the toolbar (containment).
                        description: 'toolbar items are contained within the toolbar box',
                        parent: 'section:not([hidden]) [data-test="toolbar"]',
                        children: {
                            toolbar: 'section:not([hidden]) [data-test="toolbar"]',
                            bold: 'section:not([hidden]) [data-test="tb-bold"]',
                            sep: 'section:not([hidden]) [data-test="tb-sep"]',
                            save: 'section:not([hidden]) [data-test="tb-save"]',
                        },
                        relations: [
                            { description: 'bold within toolbar', left: 'bold', op: 'contained-in', right: 'toolbar' },
                            { description: 'separator within toolbar', left: 'sep', op: 'contained-in', right: 'toolbar' },
                            { description: 'save within toolbar', left: 'save', op: 'contained-in', right: 'toolbar' },
                            {
                                description: 'save right edge does not overflow toolbar right edge',
                                left: 'save.right',
                                op: '<=',
                                right: 'toolbar.right',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // The spacer at work: Save is pushed to the right → its left is past the right of the
                        // separator (there is room in between thanks to flex:1). An invariant of the layout.
                        description: 'spacer pushes the primary action to the right',
                        parent: 'section:not([hidden]) [data-test="toolbar"]',
                        children: {
                            sep: 'section:not([hidden]) [data-test="tb-sep"]',
                            save: 'section:not([hidden]) [data-test="tb-save"]',
                        },
                        relations: [
                            { description: 'save.left > sep.right (gap created by spacer)', left: 'save.left', op: '>', right: 'sep.right' },
                        ],
                    },
                    {
                        // Row alignment: the leading buttons and the trailing action share the top
                        // (the toolbar is align-items:center, and at 900px its items sit on one row).
                        description: 'toolbar items are aligned on the same row (same top)',
                        parent: 'section:not([hidden]) [data-test="toolbar"]',
                        children: {
                            bold: 'section:not([hidden]) [data-test="tb-bold"]',
                            save: 'section:not([hidden]) [data-test="tb-save"]',
                        },
                        relations: [
                            { description: 'bold.top == save.top', left: 'bold.top', op: '==', right: 'save.top', tolerance: 3 },
                        ],
                    },
                    {
                        // A joined group: the inner buttons are flush and on the same row.
                        description: 'grouped buttons are flush on the same row',
                        parent: 'section:not([hidden]) [data-test="toolbar"] [data-test="tb-group"]',
                        children: {
                            left: 'section:not([hidden]) [data-test="tb-left"]',
                            center: 'section:not([hidden]) [data-test="tb-center"]',
                        },
                        relations: [
                            { description: 'group buttons same top', left: 'left.top', op: '==', right: 'center.top', tolerance: 2 },
                            { description: 'center.left <= left.right (touching/overlapping)', left: 'center.left', op: '<=', right: 'left.right', tolerance: 2 },
                        ],
                    },
                ],
            },
            'toolbar-bordered': {
                standalone: [
                    {
                        // Bordered: a border width is present (non-negative across themes).
                        selector: 'section:not([hidden]) [data-test="toolbar-bordered"]',
                        description: 'bordered toolbar has non-negative border width',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                    {
                        // Bordered: non-negative radius (metro/cyberpunk may zero it).
                        selector: 'section:not([hidden]) [data-test="toolbar-bordered"]',
                        description: 'bordered toolbar has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
            },
            'toolbar-vertical': {
                standalone: [
                    {
                        // Vertical: the container stays flex.
                        selector: 'section:not([hidden]) [data-test="toolbar-vertical"]',
                        description: 'vertical toolbar host renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                ],
                composition: [
                    {
                        // Vertical: the two buttons are STACKED (bottom below top), not side by side.
                        // It catches a .pdx-toolbar-vertical that lays the items out in a row instead of a column.
                        description: 'vertical toolbar stacks items in a column',
                        parent: 'section:not([hidden]) [data-test="toolbar-vertical"]',
                        children: {
                            top: 'section:not([hidden]) [data-test="tbv-top"]',
                            bottom: 'section:not([hidden]) [data-test="tbv-bottom"]',
                        },
                        relations: [
                            {
                                description: 'bottom button sits below top button (top.bottom <= bottom.top)',
                                left: 'top.bottom',
                                op: '<=',
                                right: 'bottom.top',
                                tolerance: 2,
                            },
                            {
                                description: 'both buttons share the same left edge (column, align-items:stretch)',
                                left: 'top.left',
                                op: '==',
                                right: 'bottom.left',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
            // A toolbar narrower than its controls wraps them onto further rows. Scrolling it
            // instead would clip the focus ring of the controls at its edges and hide the ones past it.
            'toolbar-narrow': {
                composition: [
                    {
                        // Numeric edges, not `contained-in`: see pagination-narrow.
                        description: 'narrow box: every control stays inside the box, on more than one row',
                        parent: 'section:not([hidden]) [data-test="tbn-box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="tbn-box"]',
                            toolbar: 'section:not([hidden]) [data-test="toolbar-narrow"]',
                            first: 'section:not([hidden]) [data-test="tbn-first"]',
                            last: 'section:not([hidden]) [data-test="tbn-last"]',
                        },
                        relations: [
                            { description: 'toolbar right edge within the box', left: 'toolbar.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'last control right edge within the box', left: 'last.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'last control inside the toolbar', left: 'last.bottom', op: '<=', right: 'toolbar.bottom', tolerance: 1 },
                            { description: 'the controls wrap: the last one is on a lower row', left: 'last.top', op: '>', right: 'first.top' },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // role="toolbar" + aria-label on the host; every button has a name (text, or aria-label for the
    // icon-only ones in toolbar-icons) → WCAG clean. Removing one aria-label there makes button-name fail.
    // No disableRules: there are no known false positives.
    a11y: {
        scenarios: ['toolbar-basic', 'toolbar-bordered', 'toolbar-vertical', 'toolbar-icons'],
    },

    // ── Dim. 3: style isolation ──
    // Target the BORDERED variant: it has a stable geometric box (border + radius md, fixed padding)
    // → a measurable width/radius/border drift under hostile CSS. skipHeight: the height follows the
    // content (buttons with the theme's font, the host's line-height) → it is not a clean invariant
    // across platforms; width/radius/border stay asserted as the guarantee of immunity.
    isolation: {
        scenario: 'toolbar-bordered',
        targets: [
            { selector: 'section:not([hidden]) [data-test="toolbar-bordered"]', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA toolbar) ──
    // One tab stop, the arrows between the controls: → moves from Bold to Italic and then INTO the
    // group (Left), End goes to Save, Home returns to Bold; afterwards Save has tabindex -1 (a single tab stop).
    keyboard: {
        scenario: 'toolbar-basic',
        initialFocus: 'section:not([hidden]) [data-test="tb-bold"]',
        steps: [
            { key: 'ArrowRight', expectFocus: 'section:not([hidden]) [data-test="tb-italic"]' },
            { key: 'ArrowRight', expectFocus: 'section:not([hidden]) [data-test="tb-left"]' },
            { key: 'End', expectFocus: 'section:not([hidden]) [data-test="tb-save"]' },
            {
                key: 'Home',
                expectFocus: 'section:not([hidden]) [data-test="tb-bold"]',
                expectAttr: { selector: 'section:not([hidden]) [data-test="tb-save"]', name: 'tabindex', value: '-1' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // basic (the full layout: sep, group, spacer) + bordered (the box/border, per theme).
    visual: {
        scenarios: ['toolbar-basic', 'toolbar-bordered', 'toolbar-vertical'],
    },
};

export default toolbar;
