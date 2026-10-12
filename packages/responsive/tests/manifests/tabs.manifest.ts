/**
 * MANIFEST — pdx-tabs  (Web Component, light DOM)
 *
 * ⚠ DISTINCT from tab.manifest.ts: that one (`name: 'tab'`, tier 2B) certifies the
 * CSS-ONLY VARIANT (static `.pdx-tabs` + `.pdx-tab.active`, no JS). THIS one certifies the CUSTOM ELEMENT `<pdx-tabs>` with
 * its runtime logic (ARIA setup, indicator, focusGroup roving). Selectors and
 * scenarios differ because the real DOM differs.
 *
 * ── Verified DOM structure (packages/ui/src/tabs/pdx-tabs.ts) ──
 *   render() = `<slot></slot>` → the children the dev writes are projected as
 *   DIRECT children of the <pdx-tabs> host (light DOM, no shadow). Canonical markup
 *   (verified in demo/showcase-new/pages/comp-tabs.pdx):
 *
 *     <pdx-tabs value="overview">
 *       <div class="pdx-tabs" role="tablist">
 *         <button class="pdx-tab" data-tab="overview">Overview</button>
 *         <button class="pdx-tab" data-tab="features">Features</button>
 *         ...
 *       </div>
 *       <div data-tab-panel="overview">...</div>
 *       <div data-tab-panel="features">...</div>
 *     </pdx-tabs>
 *
 *   The dev provides: the tablist container (class `.pdx-tabs` + `role="tablist"`),
 *   the tabs as <button class="pdx-tab" data-tab="X">, the panels as <div data-tab-panel="X">.
 *   getTabList() = querySelector('[role="tablist"]') with a fallback to '.pdx-tabs'.
 *
 *   In a rAF after mount, the setup (pdx-tabs.ts:151-217) adds, on the real children:
 *     · on every [data-tab]:    id (the author's, or "pdx-tabs-{n}-tab-{v}"), role="tab",
 *                              aria-controls = the id of its panel
 *     · on every [data-tab-panel]: id (the author's, or "pdx-tabs-{n}-panel-{v}"), role="tabpanel",
 *                              aria-labelledby = the id of its tab. {n} is per instance.
 *     · on the tablist:         aria-orientation="{orientation}"
 *     · creates <span class="pdx-tab-indicator"> appended to the tablist (NOT for variant=pills)
 *     · focusGroup(el, { selector:'[data-tab]:not([disabled])', orientation, wrap:true })
 *     · activate(initial): initial = the `value` prop || the first data-tab
 *
 *   activate(value) (pdx-tabs.ts:42-79) sets, on EVERY tab:
 *     · aria-selected = String(v===value)   → "true" on the active one, "false" on the others
 *     · tabindex      = active ? "0" : "-1" (roving: a single tabbable tab)
 *   and on EVERY panel: display = active ? '' : 'none' (mount=eager, the default).
 *   Then it emits the CustomEvent 'pdx-change' { value }.
 *
 *   Keyboard = focusGroup (core). orientation horizontal → ArrowLeft/Right (+ wrap),
 *   Home/End to the ends; onFocus with activation=automatic (the default) → activate(tab)
 *   on focus. NB: focusGroup needs an ALREADY FOCUSED MEMBER to navigate → the keyboard
 *   initialFocus points at the ACTIVE tab (the only one with tabindex=0). Do NOT use Tab as the
 *   first step: it would move the focus OUT of the group.
 *
 * ── Contracts kept conservative across all 13 themes (NO theme-specific px) ──
 *   The themes change the tab's radius/colour/padding/min-height (cupertino/playful/pragmatic
 *   override it in the pill variant; metro/cyberpunk zero the radii). So we assert only
 *   structural invariants: tablist display flex, tab cursor pointer + height>0, the active tab
 *   aria-selected="true", row alignment (the same top), tabs contained in the tablist,
 *   the active panel below the tablist (horizontal).
 *
 * ── Export/registration: VERIFIED ──
 *   · packages/ui/package.json:143 → "./tabs": { "import": "./src/tabs/pdx-tabs.ts" } ✓
 *   · packages/ui/src/index.ts:98  → import './tabs/pdx-tabs'; ✓
 *   No registration blocker.
 *
 * ── No blocking BUG. Minor notes ──
 *   · Before the rAF the tabs have no `tabindex` until activate() runs: the scenario starts
 *     with value="overview" so the setup sets the roving state within the first rAF.
 *   · The axe scan runs after the runner's waitFor, when the ARIA is already applied.
 */
import type { ComponentManifest } from './_types';

export const tabs: ComponentManifest = {
    name: 'tabs',
    tag: 'pdx-tabs',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/tabs'],

    // ── Scenarios ──
    // >=3 tabs, one of them active through the `value` prop. Markup = the canonical one from the showcase.
    // The panels have real content (the height is content-driven → isolation skipHeight).
    scenarios: [
        {
            id: 'tabs-basic',
            title: 'Tabs — Basic (3 tabs, "two" active)',
            html: `
                <div style="width: 640px; max-width: 100%;">
                    <pdx-tabs value="two" data-test="tabs">
                        <div class="pdx-tabs" role="tablist" data-test="tablist">
                            <button class="pdx-tab" data-tab="one" data-test="tab-one">One</button>
                            <button class="pdx-tab" data-tab="two" data-test="tab-two">Two</button>
                            <button class="pdx-tab" data-tab="three" data-test="tab-three">Three</button>
                        </div>
                        <div data-tab-panel="one" data-test="panel-one">First panel content goes here.</div>
                        <div data-tab-panel="two" data-test="panel-two">Second panel content goes here.</div>
                        <div data-tab-panel="three" data-test="panel-three">Third panel content goes here.</div>
                    </pdx-tabs>
                </div>`,
        },
        {
            id: 'tabs-bordered',
            title: 'Tabs — Bordered container',
            html: `
                <div style="width: 640px; max-width: 100%;">
                    <pdx-tabs value="a" bordered data-test="tabs-bordered">
                        <div class="pdx-tabs" role="tablist" data-test="tablist-bordered">
                            <button class="pdx-tab" data-tab="a" data-test="tabb-a">Alpha</button>
                            <button class="pdx-tab" data-tab="b" data-test="tabb-b">Beta</button>
                            <button class="pdx-tab" data-tab="c" data-test="tabb-c">Gamma</button>
                        </div>
                        <div data-tab-panel="a" data-test="panelb-a">Alpha content.</div>
                        <div data-tab-panel="b" data-test="panelb-b">Beta content.</div>
                        <div data-tab-panel="c" data-test="panelb-c">Gamma content.</div>
                    </pdx-tabs>
                </div>`,
        },
        {
            // Two tabs with the same values. Ids derived from the value alone
            // (`pdx-tab-general`) would repeat across the two instances: axe `duplicate-id-aria`.
            id: 'tabs-two-instances',
            title: 'Tabs — two instances with the same values',
            html: `
                <div style="width: 640px; max-width: 100%; display: grid; gap: 16px;">
                    <pdx-tabs value="general" label="Account" data-test="tabs-a">
                        <div class="pdx-tabs" role="tablist">
                            <button class="pdx-tab" data-tab="general">General</button>
                            <button class="pdx-tab" data-tab="billing">Billing</button>
                        </div>
                        <div data-tab-panel="general">Account, general.</div>
                        <div data-tab-panel="billing">Account, billing.</div>
                    </pdx-tabs>
                    <pdx-tabs value="general" label="Workspace" data-test="tabs-b">
                        <div class="pdx-tabs" role="tablist">
                            <button class="pdx-tab" data-tab="general">General</button>
                            <button class="pdx-tab" data-tab="billing">Billing</button>
                        </div>
                        <div data-tab-panel="general">Workspace, general.</div>
                        <div data-tab-panel="billing">Workspace, billing.</div>
                    </pdx-tabs>
                </div>`,
        },
        {
            // Tabs in a tabs panel, the inner sharing a value ("general") with the outer.
            // An outer that finds the inner tabs and panels too would, switched away and back (the
            // setup), hide the inner active panel and show the inner "general" one in its place.
            id: 'tabs-nested',
            title: 'Tabs — tabs inside a tabs panel',
            html: `
                <div style="width: 640px; max-width: 100%;">
                    <pdx-tabs value="general" label="Settings" data-test="tabs-outer">
                        <div class="pdx-tabs" role="tablist">
                            <button class="pdx-tab" data-tab="general">General</button>
                            <button class="pdx-tab" data-tab="advanced">Advanced</button>
                        </div>
                        <div data-tab-panel="general">
                            <pdx-tabs value="profile" label="Account" data-test="tabs-inner">
                                <div class="pdx-tabs" role="tablist">
                                    <button class="pdx-tab" data-tab="profile">Profile</button>
                                    <button class="pdx-tab" data-tab="general">Security</button>
                                </div>
                                <div data-tab-panel="profile" data-test="inner-profile">Profile form.</div>
                                <div data-tab-panel="general" data-test="inner-security">Security form.</div>
                            </pdx-tabs>
                        </div>
                        <div data-tab-panel="advanced">Advanced settings.</div>
                    </pdx-tabs>
                </div>`,
            setup: `
                const outer = document.querySelector('section:not([hidden]) [data-test="tabs-outer"]');
                for (let i = 0; i < 30 && outer.querySelectorAll('[role="tab"]').length < 4; i++) await new Promise(r => requestAnimationFrame(r));
                await new Promise(r => requestAnimationFrame(r));
                outer.select('advanced');
                outer.select('general');`,
        },
        {
            // Five tabs in 240px, the last one active. A strip that neither scrolls nor wraps
            // leaves the tabs past the edge cut off, on a phone, by the page's overflow-x: clip.
            id: 'tabs-narrow',
            title: 'Tabs — five tabs in a box narrower than them, the last one active',
            html: `
                <div data-test="tabs-box" style="width: 240px;">
                    <pdx-tabs value="support" label="Product" data-test="tabs-narrow">
                        <div class="pdx-tabs" role="tablist" data-test="tablist-narrow">
                            <button class="pdx-tab" data-tab="overview">Overview</button>
                            <button class="pdx-tab" data-tab="features">Features</button>
                            <button class="pdx-tab" data-tab="pricing">Pricing</button>
                            <button class="pdx-tab" data-tab="reviews">Reviews</button>
                            <button class="pdx-tab" data-tab="support" data-test="tabn-last">Support</button>
                        </div>
                        <div data-tab-panel="overview">Overview.</div>
                        <div data-tab-panel="features">Features.</div>
                        <div data-tab-panel="pricing">Pricing.</div>
                        <div data-tab-panel="reviews">Reviews.</div>
                        <div data-tab-panel="support">Support.</div>
                    </pdx-tabs>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal across all 13 themes) ──
    contracts: {
        scenarios: {
            'tabs-basic': {
                standalone: [
                    {
                        // Tablist: display flex (a row of tabs). An invariant of the .pdx-tabs container.
                        selector: 'section:not([hidden]) [data-test="tablist"]',
                        description: 'tablist renders as a flex row',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // Tab: cursor pointer (it is a clickable <button>).
                        selector: 'section:not([hidden]) [data-test="tab-one"]',
                        description: 'tab has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // Tab: appreciable height (the .pdx-tab min-height is ~2.75rem, theme-dependent → only >0).
                        selector: 'section:not([hidden]) [data-test="tab-one"]',
                        description: 'tab has a measurable height',
                        height: { op: '>', value: 0 },
                    },
                ],
                composition: [
                    {
                        // The three tabs share the same top (a single row, align-items:center) and
                        // have the same height (a uniform style hierarchy between the active one and the others).
                        description: 'all tabs sit on the same row with equal height',
                        parent: 'section:not([hidden]) [data-test="tablist"]',
                        children: {
                            one: 'section:not([hidden]) [data-test="tab-one"]',
                            two: 'section:not([hidden]) [data-test="tab-two"]',
                            three: 'section:not([hidden]) [data-test="tab-three"]',
                        },
                        relations: [
                            { description: 'tab one/two same top', left: 'one.top', op: '==', right: 'two.top', tolerance: 3 },
                            { description: 'tab two/three same top', left: 'two.top', op: '==', right: 'three.top', tolerance: 3 },
                            { description: 'tab one/two same height', left: 'one.height', op: '==', right: 'two.height', tolerance: 4 },
                            { description: 'tab two/three same height', left: 'two.height', op: '==', right: 'three.height', tolerance: 4 },
                            // Order in the row: two is to the right of one, three to the right of two.
                            { description: 'two.left > one.left', left: 'two.left', op: '>', right: 'one.left' },
                            { description: 'three.left > two.left', left: 'three.left', op: '>', right: 'two.left' },
                        ],
                    },
                    {
                        // Containment: every tab sits INSIDE the tablist (no overflow of the box).
                        description: 'tabs are contained within the tablist box',
                        parent: 'section:not([hidden]) [data-test="tablist"]',
                        children: {
                            tablist: 'section:not([hidden]) [data-test="tablist"]',
                            one: 'section:not([hidden]) [data-test="tab-one"]',
                            three: 'section:not([hidden]) [data-test="tab-three"]',
                        },
                        relations: [
                            { description: 'first tab within tablist', left: 'one', op: 'contained-in', right: 'tablist' },
                            { description: 'last tab within tablist', left: 'three', op: 'contained-in', right: 'tablist' },
                        ],
                    },
                    {
                        // The active panel (data-test="panel-two", value="two") BELOW the tablist (horizontal):
                        // its top is >= the bottom of the tablist. An invariant of the tablist→panel column layout.
                        description: 'active panel sits below the tablist (horizontal layout)',
                        parent: 'section:not([hidden]) [data-test="tabs"]',
                        children: {
                            tablist: 'section:not([hidden]) [data-test="tablist"]',
                            panel: 'section:not([hidden]) [data-test="panel-two"]',
                        },
                        relations: [
                            { description: 'panel.top >= tablist.bottom', left: 'panel.top', op: '>=', right: 'tablist.bottom', tolerance: 2 },
                        ],
                    },
                ],
            },
            'tabs-bordered': {
                standalone: [
                    {
                        // Bordered: the host box has a non-negative border width (metro/cyberpunk may zero it).
                        selector: 'section:not([hidden]) [data-test="tabs-bordered"]',
                        description: 'bordered tabs host has non-negative border width',
                        border: { all: { width: { op: '>=', value: 0 } } },
                    },
                    {
                        // Bordered: non-negative radius (across themes).
                        selector: 'section:not([hidden]) [data-test="tabs-bordered"]',
                        description: 'bordered tabs host has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
            },
            // After the outer tabs switch away and back, the inner tabs still show their own
            // active panel, not the one that shares the outer value.
            'tabs-nested': {
                standalone: [
                    { selector: 'section:not([hidden]) [data-test="inner-profile"]', description: 'the inner active panel is shown',
                      height: { op: '>', value: 0 } },
                    { selector: 'section:not([hidden]) [data-test="inner-security"]', description: 'the inner panel sharing the outer value stays hidden',
                      display: { op: 'is', value: 'none' } },
                ],
            },
            // A strip narrower than its tabs keeps one row and scrolls it, with the active
            // tab brought into view; otherwise the tabs run past the box and the page's clip cuts them off.
            'tabs-narrow': {
                composition: [
                    {
                        // Numeric edges, not `contained-in`: see pagination-narrow.
                        description: 'narrow box: the strip and its active tab stay inside the box',
                        parent: 'section:not([hidden]) [data-test="tabs-box"]',
                        children: {
                            box: 'section:not([hidden]) [data-test="tabs-box"]',
                            strip: 'section:not([hidden]) [data-test="tablist-narrow"]',
                            active: 'section:not([hidden]) [data-test="tabn-last"]',
                            first: 'section:not([hidden]) [data-test="tablist-narrow"] .pdx-tab:first-child',
                        },
                        relations: [
                            { description: 'strip right edge within the box', left: 'strip.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'active tab right edge within the box', left: 'active.right', op: '<=', right: 'box.right', tolerance: 1 },
                            { description: 'active tab left edge within the box', left: 'active.left', op: '>=', right: 'box.left', tolerance: 1 },
                            // Scrolled, not wrapped: the tabs keep one row.
                            { description: 'the tabs keep one row', left: 'active.top', op: '==', right: 'first.top', tolerance: 3 },
                        ],
                    },
                ],
            },
        },
        // M3's 3dp active indicator. material.css draws it as the animated `.pdx-tab-indicator`, not
        // as a border-bottom on the active `.pdx-tab` (a border there would add a second line above
        // it), so the rule measures the indicator, which only the custom element creates.
        themeOverrides: {
            material: {
                'tabs-basic': {
                    standalone: [
                        {
                            selector: 'section:not([hidden]) [data-test="tablist"] .pdx-tab-indicator',
                            description: 'material: the active indicator is shown',
                            display: { op: 'is', value: 'block' },
                        },
                        {
                            selector: 'section:not([hidden]) [data-test="tablist"] .pdx-tab-indicator',
                            description: 'material: the active indicator is 3px thick (M3 3dp)',
                            height: { op: '>=', value: 3, tolerance: 0 },
                        },
                        {
                            // The CSS-only tabs draw their indicator as a shadow on the active tab;
                            // with the element there, that would be a second line.
                            selector: 'section:not([hidden]) [data-test="tab-two"]',
                            description: 'material: with the indicator element, the active tab draws no line of its own',
                            boxShadow: { op: 'is', value: 'none' },
                        },
                    ],
                },
                // In a scrolling strip the indicator is drawn inside it: hung below, the scroller clipped it.
                'tabs-narrow': {
                    composition: [
                        {
                            description: 'material, scrolling strip: the active indicator is inside the strip, under the active tab',
                            parent: 'section:not([hidden]) [data-test="tablist-narrow"]',
                            children: {
                                strip: 'section:not([hidden]) [data-test="tablist-narrow"]',
                                indicator: 'section:not([hidden]) [data-test="tablist-narrow"] .pdx-tab-indicator',
                                active: 'section:not([hidden]) [data-test="tabn-last"]',
                            },
                            relations: [
                                { description: 'indicator bottom within the strip', left: 'indicator.bottom', op: '<=', right: 'strip.bottom', tolerance: 1 },
                                { description: 'indicator starts under the active tab', left: 'indicator.left', op: '==', right: 'active.left', tolerance: 2 },
                            ],
                        },
                    ],
                },
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    // Pattern WAI-ARIA tabs completo applicato in rAF: tablist/tab/tabpanel roles,
    // aria-selected, aria-controls/labelledby, aria-orientation. Every tab has text →
    // an accessible name. No disableRules: no known false positive.
    a11y: {
        scenarios: ['tabs-basic', 'tabs-bordered', 'tabs-two-instances', 'tabs-nested'],
    },

    // ── Dim. 3: style isolation ──
    // Target the bordered tablist: it has a geometric box (border + radius lg) measurable under
    // hostile CSS. skipHeight: the height of the tabs/panels is content-driven (the theme's and the
    // host's font/line-height) → it is not a clean invariant across platforms. radius/border/width stay
    // asserted as the real guarantee of immunity. A 10px tolerance, as in tab.manifest/toolbar.
    isolation: {
        scenario: 'tabs-bordered',
        targets: [
            { selector: 'section:not([hidden]) [data-test="tabs-bordered"]', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA roving — pattern 'tabs') ──
    // focusGroup needs an ALREADY focused member to navigate → initialFocus on the ACTIVE tab
    // ("two", the only one with tabindex=0 after activate). We do NOT use Tab (it would move the focus away).
    // orientation horizontal → ArrowRight = the next tab; with activation=automatic (the default)
    // the focus activates the tab → aria-selected="true". Home goes back to the first, End to the last.
    keyboard: {
        scenario: 'tabs-basic',
        initialFocus: 'section:not([hidden]) [data-test="tab-two"]',
        steps: [
            {
                // ArrowRight from "two" → the focus on "three" (wrap:true, but three exists → no wrap).
                key: 'ArrowRight',
                expectFocus: 'section:not([hidden]) [data-test="tab-three"]',
                expectAttr: { selector: 'section:not([hidden]) [data-test="tab-three"]', name: 'aria-selected', value: 'true' },
            },
            {
                // ArrowLeft → back to "two".
                key: 'ArrowLeft',
                expectFocus: 'section:not([hidden]) [data-test="tab-two"]',
                expectAttr: { selector: 'section:not([hidden]) [data-test="tab-two"]', name: 'aria-selected', value: 'true' },
            },
            {
                // Home → primo tab "one".
                key: 'Home',
                expectFocus: 'section:not([hidden]) [data-test="tab-one"]',
                expectAttr: { selector: 'section:not([hidden]) [data-test="tab-one"]', name: 'aria-selected', value: 'true' },
            },
            {
                // End → ultimo tab "three".
                key: 'End',
                expectFocus: 'section:not([hidden]) [data-test="tab-three"]',
                expectAttr: { selector: 'section:not([hidden]) [data-test="tab-three"]', name: 'aria-selected', value: 'true' },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // basic (indicator + the active tab, per theme) + bordered (the container box/border, per theme).
    visual: {
        scenarios: ['tabs-basic', 'tabs-bordered'],
        // The ACTIVE tab, not the first: a tablist uses a roving tabindex, so tabbing into the
        // group lands on whichever tab is selected — here 'two'. Pointing at 'one' made the run
        // fail its own toBeFocused check, which is what that check is for.
        focus: [{ scenario: 'tabs-basic', selector: 'section:not([hidden]) [data-test="tab-two"]' }],
    },
};

export default tabs;
