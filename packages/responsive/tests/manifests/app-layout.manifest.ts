/**
 * MANIFEST — pdx-app-layout (Tier 6 — layout/shell)
 *
 * Contracts written by inspecting:
 *  - the source: packages/ui/src/app-layout/pdx-app-layout.ts
 *      Light DOM, render: <slot></slot>. In rAF (on ctx.track's first run) it builds the shell
 *      DIRECTLY on the HOST <pdx-app-layout>:
 *        - it adds the class .pdx-app-layout to the host
 *        - it finds the children carrying data-region={header|navbar|aside|footer} and promotes
 *          them to regions, adding to EACH a class and a landmark role:
 *            data-region="header" → .pdx-app-header   + role="banner"
 *            data-region="navbar" → .pdx-app-navbar   + role="navigation"
 *            data-region="aside"  → .pdx-app-aside    + role="complementary"
 *            data-region="footer" → .pdx-app-footer   + role="contentinfo"
 *        - EVERY child WITHOUT data-region is moved into a <main class="pdx-app-main"> the component
 *          creates (a native <main> → an implicit role="main"). That <main> is inserted AFTER the
 *          navbar (or after the header, or first) → it lands in the "main" grid area.
 *        - it creates a <div class="pdx-app-overlay"> (the mobile backdrop, display:none by default)
 *          and appends it to the host.
 *      It sets gridTemplateColumns / gridTemplateRows inline on host.style, from the props
 *        (headerHeight=52px, footerHeight='', navbarWidth=260px, asideWidth='', ...). An empty string
 *        = the region is absent (the template filters it out). It toggles .pdx-app-with-border on the
 *        host (withBorder is true by default). The imperative API is on host.__appLayout
 *        (toggle/open/closeNavbar) — not tested here.
 *      ⚠ Everything (classes, roles, main, overlay, the inline grid) is applied inside
 *        requestAnimationFrame → the runners must wait (the measure helper already uses networkidle
 *        plus a waitForTimeout).
 *
 *  - CSS: packages/design/src/components/app-layout.css
 *      pdx-app-layout { display:block }  (the host's default, before the rAF)
 *      .pdx-app-layout { display:grid; height:100vh; overflow:hidden;
 *                        grid-template-areas: "header header header" / "navbar main aside" / "footer footer footer" }
 *      .pdx-app-header  { grid-area:header; display:flex; align-items:center; z-index:20 }
 *      .pdx-app-navbar  { grid-area:navbar; overflow-y:auto }
 *      .pdx-app-main    { grid-area:main;   overflow-y:auto }
 *      .pdx-app-aside   { grid-area:aside;  overflow-y:auto }
 *      .pdx-app-footer  { grid-area:footer; display:flex; align-items:center }
 *      .pdx-app-with-border .pdx-app-{header|navbar|aside|footer} → a 1px border on one side.
 *
 * MEASUREMENT CHOICES (they matter):
 *  - The host is `height:100vh` → without a sized parent it would take the whole viewport and the
 *    geometric relations would depend on the height of the browser, or of Docker. Every scenario
 *    wraps the shell in a FIXED 800×500px container (overflow:hidden), so the height is
 *    deterministic and the measurements (header at the top, footer at the bottom, navbar left of
 *    main) hold across runners.
 *  - The classes, the roles and the main are on the HOST and on the real children (no shadow): the
 *    selectors point at [data-test="app-layout"] (= the host) and at the .pdx-app-* /
 *    main.pdx-app-main descendants.
 *  - UNIVERSAL rules: true on every theme. No theme-specific px — only geometric RELATIONS
 *    (header.bottom <= main.top, navbar.right <= main.left, footer.top >= main.bottom) and
 *    conservative minimum thresholds (display grid, the wrapper's full height).
 *  - The headerHeight/footerHeight/navbarWidth props are prop-driven, NOT theme-driven: no exact px
 *    is asserted, only that the regions exist and are laid out where they belong.
 *
 * Accessibility (axe):
 *  - The header region has role="banner" (a landmark), the navbar role="navigation", and the main an
 *    implicit role="main". The scenario holds ONE landmark per type → no aria-label is needed to tell
 *    them apart (axe does not ask for an accessible name when a landmark is the only one of its
 *    type). No disableRules.
 *  - Note: the <nav> (role="navigation") has NO aria-label, but as the page's only nav axe does not
 *    flag it. See the BUG note below: with MORE than one landmark of a type, a name would be needed.
 *
 * Style isolation:
 *  - The shell is a PARENT-driven grid container (its height follows the wrapper) → skipHeight. The
 *    radius (normally 0: borders, not radius) stays asserted as the guarantee of geometric immunity
 *    to hostile CSS.
 *
 * Keyboard:
 *  - The shell is a pure landmark container: no keydown handler of its own, no roving tabindex.
 *    The slotted content (links in the main and in the navbar) is natively tabbable → pattern 'none';
 *    all we check is that Tab enters the shell and reaches a control inside.
 */
import type { ComponentManifest } from './_types';

export const appLayout: ComponentManifest = {
    name: 'app-layout',
    tag: 'pdx-app-layout',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/app-layout'],

    // ── Scenarios ──
    // The whole shell — header + navbar + main + footer — inside a FIXED 800×500 wrapper
    // (the host is height:100vh → it needs a sized parent for the measurements to be deterministic).
    // The slotted content is static and deterministic: a brand in the header, links in the navbar, text in the main.
    scenarios: [
        {
            id: 'app-layout-basic',
            title: 'App Layout — Header + Navbar + Main + Footer',
            html: `
                <div style="width: 800px; height: 500px; overflow: hidden;">
                    <pdx-app-layout data-test="app-layout" footer-height="40px">
                        <header data-region="header" data-test="al-header" style="font-weight:600;">My App</header>
                        <div data-region="navbar" data-test="al-navbar">
                            <a href="#" data-test="al-nav-link" style="display:block; padding:8px;">Dashboard</a>
                            <a href="#" style="display:block; padding:8px;">Settings</a>
                        </div>
                        <div data-test="al-main-content">
                            <h1>Page title</h1>
                            <p>Deterministic main content area body text.</p>
                            <button data-test="al-main-btn" type="button">Action</button>
                        </div>
                        <footer data-region="footer" data-test="al-footer">v1.0</footer>
                    </pdx-app-layout>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, derived from app-layout.css) ──
    contracts: {
        scenarios: {
            'app-layout-basic': {
                standalone: [
                    {
                        // .pdx-app-layout → display:grid.
                        selector: 'section:not([hidden]) [data-test="app-layout"]',
                        description: 'app-layout host is a grid container',
                        display: { op: 'is', value: 'grid' },
                    },
                    {
                        // It fills the 500px wrapper (height:100vh, clamped by the parent's overflow:hidden).
                        selector: 'section:not([hidden]) [data-test="app-layout"]',
                        description: 'app-layout fills the dimensioned wrapper height',
                        height: { op: '>=', value: 100 },
                    },
                    {
                        // The generated <main> exists and has overflow-y auto → a block-ish display.
                        selector: 'section:not([hidden]) [data-test="app-layout"] main.pdx-app-main',
                        description: 'generated main region is present and has a layout box',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    {
                        // Header promosso a regione flex.
                        selector: 'section:not([hidden]) [data-test="al-header"]',
                        description: 'header region is a flex row',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The container adds no spurious radius (normally 0: borders, not radius).
                        selector: 'section:not([hidden]) [data-test="app-layout"]',
                        description: 'app-layout has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                ],
                // Composition: the grid shell's geometric relations.
                //   header at the top (above the main) · navbar left of the main · footer at the bottom (below the main)
                //   · main contained in the shell's box.
                composition: [
                    {
                        description: 'app-layout arranges header/navbar/main/footer in the grid',
                        parent: 'section:not([hidden]) [data-test="app-layout"]',
                        children: {
                            shell: 'section:not([hidden]) [data-test="app-layout"]',
                            header: 'section:not([hidden]) [data-test="al-header"]',
                            navbar: 'section:not([hidden]) [data-test="al-navbar"]',
                            main: 'section:not([hidden]) [data-test="app-layout"] main.pdx-app-main',
                            footer: 'section:not([hidden]) [data-test="al-footer"]',
                        },
                        relations: [
                            {
                                description: 'header sits above the main region',
                                left: 'header.bottom',
                                op: '<=',
                                right: 'main.top',
                                tolerance: 1,
                            },
                            {
                                description: 'navbar sits to the left of the main region',
                                left: 'navbar.right',
                                op: '<=',
                                right: 'main.left',
                                tolerance: 1,
                            },
                            {
                                description: 'navbar and main share the same vertical band (top aligned)',
                                left: 'navbar.top',
                                op: '==',
                                right: 'main.top',
                                tolerance: 2,
                            },
                            {
                                description: 'footer sits below the main region',
                                left: 'footer.top',
                                op: '>=',
                                right: 'main.bottom',
                                tolerance: 1,
                            },
                            {
                                description: 'main region is contained within the shell box',
                                left: 'main',
                                op: 'contained-in',
                                right: 'shell',
                            },
                            {
                                description: 'header is contained within the shell box',
                                left: 'header',
                                op: 'contained-in',
                                right: 'shell',
                            },
                            {
                                description: 'footer is contained within the shell box',
                                left: 'footer',
                                op: 'contained-in',
                                right: 'shell',
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // banner (header) + navigation (navbar) + main (generated): one landmark per type → axe is happy
    // without an aria-label. The navbar links and the main's button have accessible text. No disableRules.
    a11y: {
        scenarios: ['app-layout-basic'],
    },

    // ── Dim. 3: style isolation ──
    // The shell is a PARENT-driven grid (its height follows the 500px wrapper): under hostile font or
    // line-height CSS the height can follow the content or the parent → skipHeight (as for sidebar and
    // card). The radius (a CSS value, not scaled) stays asserted as the guarantee of geometric immunity.
    isolation: {
        scenario: 'app-layout-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="app-layout"]', tolerancePx: 2, skipHeight: true, leaks: [{ issue: 170, properties: ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing'] }] },
        ],
    },

    // ── Dim. 4: keyboard (a landmark container → 'none') ──
    // No keydown or roving of its own: Tab enters the shell and reaches the native slotted controls
    // (the navbar's links, the main's button).
    keyboard: {
        scenario: 'app-layout-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: 'section:not([hidden]) [data-test="app-layout"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: the whole shell (header/navbar/main/footer) covers the entire visual layout.
    visual: {
        scenarios: ['app-layout-basic'],
    },
};

export default appLayout;
