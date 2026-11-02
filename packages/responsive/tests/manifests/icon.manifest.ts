/**
 * MANIFEST — pdx-icon
 *
 * Contracts DERIVED by inspecting the source (packages/ui/src/icon/pdx-icon.ts).
 *
 * DOM STRUCTURE (light DOM, no shadow):
 *   <pdx-icon> (host) > <span data-part="root" class="pdx-icon-container"> > <svg>
 *   The class is how pdx.reset sees the root, and keeps a page's bare `span { border }` off it.
 *   icon.css draws the root (inline-flex, centred, `--pdx-icon-size` square); the effect writes only
 *   `--pdx-icon-size` on it (#291). The inner <svg> is normalised to width:100% / height:100% (it fills
 *   the root).
 *
 * SIZING (source, SIZES px): xs=12, sm=16, md=20 (default), lg=24, xl=32, or a number of pixels.
 *   No theme redefines `--pdx-icon-size` → an INVARIANT on all 13 themes. The hierarchy
 *   sm(16) < md(20) < lg(24) can be verified mathematically.
 *
 * ARIA (source, effect):
 *   - an EMPTY label (a decorative icon)  → the host: aria-hidden="true", no role, no aria-label.
 *   - a label WITH A VALUE (a semantic icon) → the host: role="img" + aria-label="<label>", aria-hidden removed.
 *
 * THE ICON SOURCE — the `name` prop is used (the "pragmatic" icon set):
 *   `@pdxui/ui`'s index.ts calls
 *   registerPragmaticIcons() on import → the "pragmatic" set is registered and (being the first)
 *   becomes the default. So `<pdx-icon name="check">` resolves the glyph through resolveIcon()
 *   without naming a `set`. With no set registered, resolveIcon returns
 *   null → `<pdx-icon name>` renders no <svg> for EVERY consumer. This manifest
 *   certifies the `name` path end to end.
 *   The names used: 'check' and 'home' (real glyphs of the pragmatic-icons.ts set).
 *
 * Selectors ALWAYS scoped `section:not([hidden]) ...`.
 */
import type { ComponentManifest } from './_types';

// resolveIcon() (core) is ASYNC: the <svg> for `name` is injected after a microtask, not
// synchronously. We wait until every <pdx-icon> of the active section has its <svg> before
// signalling ready (a ~60-frame guard at most) → deterministic measurements and visuals across operating systems.
const WAIT_ICONS = `await new Promise((r) => { let n = 0; const c = () => { const icons = Array.from(document.querySelectorAll('section:not([hidden]) pdx-icon')); if ((icons.length && icons.every((i) => i.querySelector('svg'))) || n++ > 60) r(); else requestAnimationFrame(c); }; c(); });`;

export const icon: ComponentManifest = {
    name: 'icon',
    tag: 'pdx-icon',
    tier: '1A',
    status: 'wip',
    imports: ['@pdxui/ui/icon/pdx-icon'],

    // ── Scenarios ──
    scenarios: [
        {
            // (a) A DECORATIVE icon: no label → the host is aria-hidden="true", with no role and no aria-label.
            id: 'icon-decorative',
            title: 'Icon — Decorative (aria-hidden)',
            html: `
                <div class="row">
                    <pdx-icon data-test="icon-decorative" name="check"></pdx-icon>
                </div>`,
            setup: WAIT_ICONS,
        },
        {
            // A SEMANTIC icon: the label is set → the host gets role="img" + aria-label. Used for a11y.
            id: 'icon-semantic',
            title: 'Icon — Semantic (role=img + aria-label)',
            html: `
                <div class="row">
                    <pdx-icon data-test="icon-semantic" name="home" label="Home"></pdx-icon>
                </div>`,
            setup: WAIT_ICONS,
        },
        {
            // (b) SIZES: sm(16) < md(20) < lg(24). The hierarchy is on the root part.
            id: 'icon-sizes',
            title: 'Icon — Sizes (sm / md / lg)',
            html: `
                <div class="row">
                    <pdx-icon data-test="icon-sm" size="sm" name="check"></pdx-icon>
                    <pdx-icon data-test="icon-md" size="md" name="check"></pdx-icon>
                    <pdx-icon data-test="icon-lg" size="lg" name="check"></pdx-icon>
                </div>`,
            setup: WAIT_ICONS,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'icon-decorative': {
                standalone: [
                    {
                        // The root is inline-flex (icon.css).
                        selector: 'section:not([hidden]) [data-test="icon-decorative"] [data-part="root"]',
                        description: 'icon container is inline-flex',
                        display: { op: 'is', value: 'inline-flex' },
                    },
                    {
                        // md (default) → 20px. A cautious bound: >= 12 (the smallest size, xs).
                        selector: 'section:not([hidden]) [data-test="icon-decorative"] [data-part="root"]',
                        description: 'icon container has positive width (>= 12px)',
                        width: { op: '>=', value: 12 },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="icon-decorative"] [data-part="root"]',
                        description: 'icon container has positive height (>= 12px)',
                        height: { op: '>=', value: 12 },
                    },
                ],
            },
            'icon-sizes': {
                // The size hierarchy: an invariant on every theme (no theme redefines --pdx-icon-size).
                composition: [
                    {
                        description: 'size hierarchy: sm < md < lg container size',
                        parent: 'section:not([hidden]) .row',
                        children: {
                            sm: 'section:not([hidden]) [data-test="icon-sm"] [data-part="root"]',
                            md: 'section:not([hidden]) [data-test="icon-md"] [data-part="root"]',
                            lg: 'section:not([hidden]) [data-test="icon-lg"] [data-part="root"]',
                        },
                        relations: [
                            { description: 'sm width < md width', left: 'sm.width', op: '<', right: 'md.width' },
                            { description: 'md width < lg width', left: 'md.width', op: '<', right: 'lg.width' },
                            { description: 'sm height < md height', left: 'sm.height', op: '<', right: 'md.height' },
                            { description: 'md height < lg height', left: 'md.height', op: '<', right: 'lg.height' },
                        ],
                    },
                    {
                        // The <svg> is normalised to 100%/100% → it stays contained in the container.
                        description: 'inner svg is contained within the md icon container',
                        parent: 'section:not([hidden]) [data-test="icon-md"] [data-part="root"]',
                        children: {
                            container: 'section:not([hidden]) [data-test="icon-md"] [data-part="root"]',
                            svg: 'section:not([hidden]) [data-test="icon-md"] [data-part="root"] svg',
                        },
                        relations: [
                            { description: 'svg within container', left: 'svg', op: 'contained-in', right: 'container' },
                            { description: 'svg width <= container width', left: 'svg.width', op: '<=', right: 'container.width', tolerance: 1 },
                            { description: 'svg height <= container height', left: 'svg.height', op: '<=', right: 'container.height', tolerance: 1 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // A decorative icon (aria-hidden="true") → invisible to the a11y tree, no violation.
        // A semantic icon (role="img" + aria-label="Home") → an accessible name is there, and it passes clean.
        // No disableRules: both patterns are conformant by design.
        scenarios: ['icon-decorative', 'icon-semantic'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'icon-decorative',
        targets: [
            // The size (20px for md) is drawn by icon.css from --pdx-icon-size → it must resist hostile global CSS.
            // It is not font- or transform-driven: the height IS a structural invariant → NO skipHeight.
            { selector: 'section:not([hidden]) [data-test="icon-decorative"] [data-part="root"]', tolerancePx: 4 },
        ],
    },

    // ── Dim. 4: keyboard ──
    // An icon is NOT interactive (decorative, or semantic and static) → no keyboard pattern.
    keyboard: {
        scenario: 'icon-decorative',
    },

    // ── Dim. 5: visual regression (Docker) ──
    // The SVG is deterministic (a static path, currentColor) → one scenario is enough.
    visual: {
        scenarios: ['icon-decorative'],
    },
};

export default icon;
