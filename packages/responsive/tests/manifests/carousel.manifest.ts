/**
 * MANIFEST — pdx-carousel
 *
 * Contracts DERIVED by inspecting the source and the CSS:
 *
 *   - Source: packages/ui/src/carousel/pdx-carousel.ts
 *       · the custom element <pdx-carousel> has render() = html`` (empty): in an rAF (the track, lines 418-422)
 *         it creates an inner <div class="pdx-carousel-root"> inside the host and calls buildCarousel().
 *       · buildCarousel() (line 255) builds:
 *           - .pdx-carousel-root  → role="region", aria-roledescription="carousel" (lines 269-270)
 *           - .pdx-carousel-track → display:flex, it holds the slides
 *           - .pdx-carousel-slide → role="group", aria-roledescription="slide",
 *                                   aria-label="`${i+1} of ${count}`"  (lines 211-214)
 *           - .pdx-carousel-arrow-prev / -next  (ONLY when showArrows && items.length>1)
 *                 aria-label="Previous slide" / "Next slide"  (lines 311, 318)
 *                 innerHTML = <pdx-icon name="chevron-left|right">
 *           - .pdx-carousel-dots  → role="tablist" (ONLY when showDots && items.length>1)
 *                 .pdx-carousel-dot → role="tab", aria-label="Go to slide N", aria-selected
 *                 N dots = getSlideCount() = items.length - slidesPerView + 1 (lines 61-67)
 *       · the `items` prop is an Array → passed as a JSON attribute (core/component.ts:379 does the JSON.parse).
 *       · Events: pdx-change, pdx-autoplay-start, pdx-autoplay-stop (not tested here).
 *       · Keyboard (onKeydown, line 394): the HOST is tabIndex=0 (line 350) and handles
 *           ArrowLeft → prev(), ArrowRight → next(). With loop+slide+more than one item it uses the "virtual loop"
 *           (a DOM reorder, currentIndex changes) → it does NOT move the track (which stays at offset 0), but it changes
 *           the leading slide's aria-label and the dots' aria-selected → testable through expectAttr.
 *
 *   - CSS: packages/design/src/components/carousel.css
 *       · pdx-carousel { display:block }  (host)
 *       · .pdx-carousel-root { position:relative; overflow:hidden; border-radius: radius-md }
 *       · .pdx-carousel-track { display:flex }
 *       · .pdx-carousel-arrow { cursor:pointer; border-radius:50%; width/height 36px }
 *       · .pdx-carousel-dot   { cursor:pointer; border-radius:50% }
 *
 * ── DETERMINISM (CRITICAL) ──
 *   1. autoplay OFF (false by default): no setInterval → the slide does NOT change by itself during
 *      the measurement or the screenshot. The track has a 0.4s transition; with no autoplay and no interaction
 *      it stays at offset 0 (slide 0 visible). `autoplay="false"` is written in the markup anyway.
 *   2. FIXED content, NOT images or anything random: every slide uses item.content with a <div class="…">.
 *      ⚠ sanitizeHTML (sanitize.ts) does NOT whitelist the `style` attribute → an inline style would be
 *      stripped. So the height and the colour are defined in a <style> inside the scenario fragment (which is
 *      injected VERBATIM into the <section>, not sanitized) and the class is referenced (it is whitelisted)
 *      inside item.content. A fixed height of 160px → deterministic geometry, no dependency on the network.
 *   3. animation="slide" (the default), slidesPerView=1, loop default (true): slide 0 fills the track.
 *
 * CONSERVATIVE contracts, true on all 13 themes: NO theme-specific px.
 *   - host display:block; root display:block + overflow:hidden + radius>=0.
 *   - the track is display:flex; the slide's content is visible INSIDE the root (containment).
 *   - the arrows and the dots are cursor:pointer; the arrows are INSIDE the carousel; #dots == #slides (3).
 *
 * ── REAL BUGS: none. ──
 *   The ARIA is complete and correct: region + aria-roledescription="carousel"; the arrows have aria-label
 *   Previous/Next slide; the slides have role=group + aria-roledescription="slide" + aria-label "i of n";
 *   the dots have role=tab + aria-label + aria-selected; the dots container has role=tablist.
 *   (A possible future improvement, NOT a bug: there is no aria-live region on the track to announce
 *    the slide change to screen readers — to look into in a future a11y wave.)
 */
import type { ComponentManifest } from './_types';

// 3 deterministic slides: coloured boxes of a fixed height (NO images, NO randomness).
// The <style> in the fragment gives the height; item.content carries only a class and text (a style would be
// stripped by sanitizeHTML). The slides' aria-labels will be "1 of 3" / "2 of 3" / "3 of 3".
const ITEMS = JSON.stringify([
    { content: '<div class="demo-slide demo-slide-1" data-test="slide-content-0">Slide One</div>' },
    { content: '<div class="demo-slide demo-slide-2" data-test="slide-content-1">Slide Two</div>' },
    { content: '<div class="demo-slide demo-slide-3" data-test="slide-content-2">Slide Three</div>' },
]).replace(/'/g, '&#39;');

// The content's CSS: injected verbatim into the <section> (not sanitized). A FIXED height.
const SLIDE_STYLE = `
                <style>
                    .demo-slide { height: 160px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; }
                    .demo-slide-1 { background: oklch(0.55 0.18 235); }
                    .demo-slide-2 { background: oklch(0.55 0.18 155); }
                    .demo-slide-3 { background: oklch(0.55 0.18 25); }
                </style>`;

export const carousel: ComponentManifest = {
    name: 'carousel',
    tag: 'pdx-carousel',
    tier: '3',
    status: 'wip',
    imports: ['@pdxui/ui/carousel'],

    // ── Scenarios ──
    // One deterministic interactive scenario: 3 slides, autoplay OFF, arrows and dots visible
    // (items.length>1 → both are built). A fixed-width container, for a stable geometry.
    scenarios: [
        {
            id: 'carousel-basic',
            title: 'Carousel — 3 slides (autoplay off)',
            html: `
                <div style="width: 640px; max-width: 100%;">${SLIDE_STYLE}
                    <pdx-carousel
                        data-test="carousel"
                        autoplay="false"
                        items='${ITEMS}'></pdx-carousel>
                </div>`,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal, every theme) ──
    contracts: {
        scenarios: {
            'carousel-basic': {
                standalone: [
                    {
                        // The host is display:block (carousel.css: pdx-carousel { display:block }).
                        selector: 'section:not([hidden]) [data-test="carousel"]',
                        description: 'carousel host renders as a block',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    {
                        // The inner root is the viewport: position:relative + overflow:hidden.
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                        description: 'carousel root is a block-ish box (display set)',
                        display: { op: 'oneOf', value: ['block', 'flex', 'grid'] },
                    },
                    {
                        // A noticeable height: the active slide is 160px tall (fixed) → the root follows it.
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                        description: 'carousel root has a measurable height (content-driven slide)',
                        height: { op: '>=', value: 100 },
                    },
                    {
                        // Width: the carousel takes the container (640px) → a noticeable width.
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                        description: 'carousel root spans the container width',
                        width: { op: '>=', value: 200 },
                    },
                    {
                        // A non-negative radius (radius-md; metro and cyberpunk may zero it).
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                        description: 'carousel root has non-negative border radius',
                        radius: { all: { op: '>=', value: 0 } },
                    },
                    {
                        // The track: display flex (that is, the slides sit side by side in a row).
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-track',
                        description: 'carousel track renders as flex',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // Arrows: cursor pointer (CSS .pdx-carousel-arrow).
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-arrow-prev',
                        description: 'prev arrow has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-arrow-next',
                        description: 'next arrow has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // Dots: cursor pointer (CSS .pdx-carousel-dot).
                        selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-dot',
                        description: 'dot indicator has cursor pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                ],
                composition: [
                    {
                        // The active slide (the first one, currentIndex=0) is VISIBLE and CONTAINED in the track,
                        // and the track is contained in the root (the viewport, with overflow:hidden).
                        description: 'active slide is contained in the track, track contained in the root',
                        parent: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                        children: {
                            root: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                            track: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-track',
                            slide0: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-track > .pdx-carousel-slide:first-child',
                        },
                        relations: [
                            { description: 'track within root', left: 'track', op: 'contained-in', right: 'root' },
                            {
                                // The active slide does not spill past the viewport on the left (offset 0).
                                description: 'active slide left edge aligns with root left edge',
                                left: 'slide0.left',
                                op: '==',
                                right: 'root.left',
                                tolerance: 2,
                            },
                            {
                                // The active slide is as tall as the viewport (visible, not collapsed).
                                description: 'active slide top aligns with root top',
                                left: 'slide0.top',
                                op: '==',
                                right: 'root.top',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // The arrows are INSIDE the carousel (an absolute overlay above the viewport).
                        description: 'arrows are contained within the carousel root',
                        parent: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                        children: {
                            root: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root',
                            prev: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-arrow-prev',
                            next: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-arrow-next',
                        },
                        relations: [
                            { description: 'prev arrow within root', left: 'prev', op: 'contained-in', right: 'root' },
                            { description: 'next arrow within root', left: 'next', op: 'contained-in', right: 'root' },
                            {
                                // prev on the left, next on the right (CSS left:12px / right:12px).
                                description: 'prev arrow sits left of next arrow',
                                left: 'prev.right',
                                op: '<=',
                                right: 'next.left',
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // region + aria-roledescription="carousel" + aria-label ("Carousel": without a name it
    // is not a landmark); the arrows have an aria-label; the slides role=group + aria-label; the dots role=tab +
    // aria-label + aria-selected + aria-controls. No known false positive.
    a11y: {
        scenarios: ['carousel-basic'],
    },

    // ── Dim. 3: style isolation ──
    // The target is the ROOT (the viewport): a geometric box with overflow:hidden and radius-md. skipHeight because
    // the height is content-driven (the 160px slides, sensitive to the host's font and line-height under hostile
    // CSS, and the drift is stronger on Linux/Docker). The width and the radius stay asserted as the immunity
    // guarantee (as for card, toolbar and dialog).
    isolation: {
        scenario: 'carousel-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-root', tolerancePx: 10, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard (WAI-ARIA) ──
    // Pattern 'none' (it is not a standard WAI-ARIA roving or tabs widget): the host is a single tab stop (tabIndex=0)
    // and ArrowRight/ArrowLeft change the slide. With loop+slide+more than one item the "virtual loop" does NOT
    // translate the track (it stays at offset 0, the DOM is reordered) → so expectGeometryChange is NOT used on the
    // track. What is checked is the OBSERVABLE effect of the slide change: ArrowRight → the second dot becomes selected
    // (aria-selected="true"), moving from currentIndex 0 to 1.
    // The dots are a complete tablist — a roving tabindex (only the selected tab has
    // tabindex=0) and the arrows move both focus AND selection. It starts from the first tab: one step only,
    // because in the virtual loop a second move inside the transition (0.4s) is ignored, and settle
    // waits two frames. The arrow on the region is covered by the unit test (carousel-a11y.test.ts).
    keyboard: {
        scenario: 'carousel-basic',
        initialFocus: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-dot:nth-child(1)',
        steps: [
            {
                key: 'ArrowRight',
                expectFocus: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-dot:nth-child(2)',
                expectAttr: {
                    selector: 'section:not([hidden]) [data-test="carousel"] .pdx-carousel-dot:nth-child(2)',
                    name: 'aria-selected',
                    value: 'true',
                },
            },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    // One scenario: the whole layout (a coloured slide plus the arrows and the dots), which the maths
    // does not catch entirely (the colours, the arrows' position, the active dot's shape per theme).
    visual: {
        scenarios: ['carousel-basic'],
    },
};

export default carousel;
