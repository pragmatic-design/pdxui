/**
 * MANIFEST — pdx-image
 *
 * Contracts DERIVED by inspecting the source and the CSS:
 *   - Source: packages/ui/src/image/pdx-image.ts
 *       · component('pdx-image', ...). The relevant props: src, alt, width, height, fit,
 *         lazy (default TRUE), placeholder (default 'skeleton'), ratio, rounded, radius,
 *         fallback, fallbackIcon, zoomable, lightbox, caption, authSrc, ...
 *       · DOM built in a requestAnimationFrame inside ctx.track() (line 243+):
 *           the HOST <pdx-image> gets the class `pdx-img-root` + style.width/height.
 *           Inner: <div class="pdx-img-wrapper"> (it gets style.aspectRatio = ratio when ratio,
 *             the class `pdx-img-rounded` when rounded, style.borderRadius when radius).
 *           Inside the wrapper: <img class="pdx-img pdx-img-loading"> with alt and objectFit.
 *           When placeholder==='skeleton': <div class="pdx-img-skeleton"> (it PULSES → not
 *             deterministic for the visual dimension, see below).
 *       · alt is forwarded to the inner <img> (line 266, `_imgEl.alt = alt`), and also
 *         to the fallback image (line 81) and to the lightbox (line 184). → a11y is fine, no bug.
 *       · Loading: with lazy=true (the default) it uses an IntersectionObserver (rootMargin 200px),
 *         so the src is assigned ASYNCHRONOUSLY. With lazy=false it loads at once
 *         (loadImage → _imgEl.src = src).
 *       · onload adds the class `pdx-img-loaded` (opacity 1) and removes the skeleton.
 *   - CSS: packages/design/src/components/image.css
 *       · .pdx-img-root { display:inline-block; position:relative; overflow:hidden; line-height:0 }
 *       · .pdx-img-wrapper { position:relative; width:100%; height:100%; display:flex;
 *           background: surface-inset }  → the height follows the content, or the aspect ratio.
 *       · .pdx-img { display:block; width:100%; height:100% }
 *       · .pdx-img-skeleton { position:absolute; inset:0; animation: pdx-img-pulse 1.5s infinite }
 *       · .pdx-img-rounded { border-radius:50% }
 *
 * THE IMAGE'S DETERMINISM (CRITICAL):
 *   To make the rendering reproducible (no network, no IntersectionObserver timing):
 *     - src = an inline SVG data URI (decoded synchronously, no fetch).
 *     - lazy="false" → it loads at mount, with no IntersectionObserver.
 *     - placeholder="none" → no pulsing skeleton (the `pdx-img-pulse` animation
 *       would make the screenshot non-deterministic).
 *   The result: the <img> has a valid src from the start; the box is driven by an explicit width
 *   plus the wrapper's aspect ratio. For the visual dimension a mask on the skeleton is added anyway,
 *   as a safety belt (in case it ever appeared, in some theme or some timing).
 *
 * THE STRATEGY for measuring the geometry:
 *   - The root is inline-block with width=auto → without an explicit width it collapses. So
 *     width="320px" is ALWAYS set on the host, and the geometry is deterministic.
 *   - With ratio="16/9" on the wrapper, the height is derived by the browser (height ≈ width*9/16).
 *     What is checked is the RELATION (landscape: height < width), not absolute px → universal.
 *   - skipHeight in the isolation: the root's and the wrapper's height is aspect-ratio- and content-driven
 *     (not a clean structural invariant); the radius stays asserted as the guarantee of
 *     immunity to outside styling.
 *
 * a11y: alt is on the inner <img> → no axe violation (image-alt). A scenario with a meaningful
 *   alt is used. For the decorative case, alt="" plus role
 *   presentation would be worth considering, but the component exposes only `alt` (no decorative flag): a
 *   descriptive alt is the right and sufficient choice for WCAG here.
 *
 * keyboard: 'none' — the base image is not interactive (zoom and lightbox are opt-in and
 *   driven by a click plus Escape on the lightbox overlay, not a keyboard focus pattern
 *   on the host). The base scenario = no keyboard navigation.
 *
 * Selectors ALWAYS scoped `section:not([hidden]) ...`.
 */
import type { ComponentManifest } from './_types';

// A data-URI SVG: synchronous decoding, no network → deterministic rendering.
// A solid-colour square or rectangle (no gradient, no unstable antialiasing).
const SVG_SRC =
    "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='320'%20height='180'%3E%3Crect%20width='320'%20height='180'%20fill='%234a6fa5'/%3E%3C/svg%3E";

export const image: ComponentManifest = {
    name: 'image',
    tag: 'pdx-image',
    tier: '7',
    status: 'wip',
    imports: ['@pdxui/ui/image'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'image-basic',
            title: 'Image — Basic (16/9, eager, deterministic SVG)',
            // an explicit width → deterministic geometry. lazy=false + placeholder=none →
            // it loads at once, with no pulsing skeleton. alt is ALWAYS there (a11y).
            html: `
                <div style="width:320px">
                    <pdx-image
                        data-test="image"
                        width="320px"
                        ratio="16/9"
                        lazy="false"
                        placeholder="none"
                        alt="A solid blue placeholder graphic"
                        src="${SVG_SRC}">
                    </pdx-image>
                </div>`,
        },
        {
            id: 'image-rounded',
            title: 'Image — Rounded (circular, 1/1)',
            // rounded → the wrapper gets .pdx-img-rounded (border-radius:50%). 1/1, square.
            html: `
                <div style="width:160px">
                    <pdx-image
                        data-test="image-rounded"
                        width="160px"
                        ratio="1/1"
                        rounded
                        lazy="false"
                        placeholder="none"
                        alt="A round solid blue avatar placeholder"
                        src="${SVG_SRC}">
                    </pdx-image>
                </div>`,
        },
        {
            // The lightbox: the wrapper is a "View {alt}" button, Enter opens a modal dialog
            // with the close button focused, and Escape returns to the button.
            id: 'image-lightbox',
            title: 'Image — Lightbox trigger (keyboard)',
            html: `
                <div style="width:320px">
                    <pdx-image
                        data-test="image-lb"
                        width="320px"
                        ratio="16/9"
                        lazy="false"
                        placeholder="none"
                        lightbox
                        caption="A blue placeholder"
                        alt="A solid blue placeholder graphic"
                        src="${SVG_SRC}">
                    </pdx-image>
                </div>`,
        },
        {
            // The lightbox OPEN, for axe: a modal dialog with a name and a close button.
            id: 'image-lightbox-open',
            title: 'Image — Lightbox open',
            html: `
                <div style="width:320px">
                    <pdx-image
                        data-test="image-lb-open"
                        width="320px"
                        ratio="16/9"
                        lazy="false"
                        placeholder="none"
                        lightbox
                        alt="A solid blue placeholder graphic"
                        src="${SVG_SRC}">
                    </pdx-image>
                </div>`,
            setup: `
                const w = document.querySelector('section:not([hidden]) [data-test="image-lb-open"] .pdx-img-wrapper');
                if (w) w.click();
                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'image-basic': {
                standalone: [
                    {
                        selector: 'section:not([hidden]) [data-test="image"]',
                        description: 'image host renders as a box (inline-block/block)',
                        display: { op: 'oneOf', value: ['inline-block', 'block', 'flex', 'grid'] },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="image"]',
                        description: 'host fills its explicit 320px width',
                        width: { op: '>=', value: 200 },
                    },
                    {
                        // The inner <img> must exist and be a visible box.
                        selector: 'section:not([hidden]) [data-test="image"] .pdx-img',
                        description: 'inner img renders as a block',
                        display: { op: 'oneOf', value: ['block', 'inline-block', 'flex'] },
                    },
                ],
                composition: [
                    {
                        // 16:9 → height < width (landscape). The ratio's robust invariant,
                        // not absolute px.
                        description: '16:9 image box is landscape (height < width)',
                        parent: 'body',
                        children: {
                            box: 'section:not([hidden]) [data-test="image"] .pdx-img-wrapper',
                            box2: 'section:not([hidden]) [data-test="image"] .pdx-img-wrapper',
                        },
                        relations: [
                            { description: 'wrapper height < wrapper width', left: 'box.height', op: '<', right: 'box2.width' },
                        ],
                    },
                    {
                        // Containment: the <img> sits INSIDE the wrapper (which has overflow:hidden).
                        description: 'inner img is contained within the wrapper',
                        parent: 'section:not([hidden]) [data-test="image"] .pdx-img-wrapper',
                        children: {
                            wrapper: 'section:not([hidden]) [data-test="image"] .pdx-img-wrapper',
                            img: 'section:not([hidden]) [data-test="image"] .pdx-img',
                        },
                        relations: [
                            { description: 'img within wrapper', left: 'img', op: 'contained-in', right: 'wrapper' },
                            { description: 'img height <= wrapper height', left: 'img.height', op: '<=', right: 'wrapper.height', tolerance: 1 },
                            { description: 'img width <= wrapper width', left: 'img.width', op: '<=', right: 'wrapper.width', tolerance: 1 },
                        ],
                    },
                ],
            },
            'image-rounded': {
                standalone: [
                    {
                        // .pdx-img-rounded { border-radius:50% } → radius > 0 on every theme.
                        selector: 'section:not([hidden]) [data-test="image-rounded"] .pdx-img-wrapper',
                        description: 'rounded image wrapper has a positive border radius',
                        radius: { all: { op: '>', value: 0 } },
                    },
                ],
                composition: [
                    {
                        // 1:1 → a square (width == height) on the wrapper.
                        description: '1:1 image box is square (width == height)',
                        parent: 'body',
                        children: {
                            box: 'section:not([hidden]) [data-test="image-rounded"] .pdx-img-wrapper',
                            box2: 'section:not([hidden]) [data-test="image-rounded"] .pdx-img-wrapper',
                        },
                        relations: [
                            { description: 'wrapper width == height', left: 'box.width', op: '==', right: 'box2.height', tolerance: 2 },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core (WCAG) ──
    a11y: {
        // alt is there on the inner <img> (source line 266) → image-alt is satisfied.
        // image-lightbox: the trigger is a named role=button; image-lightbox-open: the dialog open.
        scenarios: ['image-basic', 'image-lightbox', 'image-lightbox-open'],
    },

    // ── Dim. 3: style isolation ──
    isolation: {
        scenario: 'image-basic',
        targets: [
            // The height is derived from the aspect-ratio + width (content/parent-driven): skipHeight;
            // the invariant is the ratio (checked in the contract), not an absolute height.
            // The wrapper is the stable visual box; a wide tolerance for the drift across operating systems.
            { selector: 'section:not([hidden]) [data-test="image"] .pdx-img-wrapper', tolerancePx: 10, skipHeight: true, leaks: [{ issue: 170, properties: ['color', 'fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'borderTopWidth', 'borderTopStyle', 'borderTopColor'] }] },
        ],
    },

    // ── Dim. 4: keyboard — the lightbox. The base image is not interactive; with `lightbox`
    // the wrapper is the button: Tab reaches it, Enter opens the dialog with the focus on the close button,
// Tab stays inside (the trap), Escape closes and returns to the button.
    keyboard: {
        scenario: 'image-lightbox',
        steps: [
            { key: 'Tab', expectFocus: 'section:not([hidden]) [data-test="image-lb"] .pdx-img-wrapper[role="button"]' },
            { key: 'Enter', expectFocus: '.pdx-img-lightbox[role="dialog"] .pdx-img-lightbox-close' },
            { key: 'Tab', expectFocusWithin: '.pdx-img-lightbox[role="dialog"]' },
            { key: 'Escape', expectFocus: 'section:not([hidden]) [data-test="image-lb"] .pdx-img-wrapper[role="button"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        // SVG data-URI + lazy=false + placeholder=none → deterministic rendering.
        // A mask on the skeleton as a safety belt (the pulse animation) — it should
        // never appear with placeholder="none", but it keeps a theme that reintroduced it from causing flake.
        scenarios: ['image-basic'],
        mask: ['.pdx-img-skeleton'],
    },
};

export default image;
