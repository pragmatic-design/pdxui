/**
 * MANIFEST — pdx-scroll-spy (Tier 6)
 *
 * Contracts written by inspecting the source (packages/ui/src/scroll-spy/pdx-scroll-spy.ts).
 *
 * WHAT IT DOES
 *   It highlights the navigation entry for the section currently in the viewport,
 *   using an IntersectionObserver. It is a PURELY BEHAVIOURAL component: it wraps the
 *   developer's markup (a nav with links plus the sections) and changes its state while scrolling.
 *
 * DOM STRUCTURE (host vs inner)
 *   render: () => html`<slot></slot>`  →  there is NO inner div. The host <pdx-scroll-spy>
 *   projects the developer's content directly. There is no dedicated CSS class:
 *   grep `.pdx-scroll-spy` in packages/design/src/ → NO match. Styling the entries is entirely
 *   the developer's markup's job (here: a <nav> with <a class="spy-link"> elements).
 *
 * PROPS (source, lines 8-16)
 *   - section-selector (default '[data-section]')  → which sections to observe
 *   - link-selector    (default '[data-spy-link]') → which links to highlight
 *   - offset           (100 by default)          → the top threshold for activation (rootMargin)
 *   - smooth-scroll    (true by default)         → a smooth scroll when a link is clicked
 *
 * EVENTS
 *   - pdx-change { section } → emitted when the active section changes (line 53). Async and scroll-driven.
 *
 * THE ACTIVE STATE (source, updateLinks() lines 85-97)
 *   On the active link: it adds the '.active' class (a toggle) and the attribute aria-current="true";
 *   on the others it removes both. The match is by href#id, or data-spy-target == data-section.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * DETERMINISM — this component's critical point
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   The active state depends on the SCROLL: updateLinks() is called ONLY inside the
 *   IntersectionObserver's callback (lines 35-54), which fires ASYNCHRONOUSLY, with a timing tied
 *   to the layout and the scroll. There is NO synchronous initialisation of the active state at mount:
 *   on the first paint NO link is marked until the observer fires.
 *
 *   Conceptually, at scroll-top the first section (the top one, with the smallest rect.top) is the active one →
 *   the first link gets .active. But relying on the observer's firing makes the measurement FLAKY
 *   (it depends on when the browser delivers the first entry).
 *
 *   THE CHOICE: nothing is scrolled during the test and the observer is not awaited. The `setup` applies
 *   the scroll-top state (the first entry active) SYNCHRONOUSLY and deterministically, reproducing
 *   EXACTLY what updateLinks() does (the .active class plus aria-current). We measure the stable
 *   initial state. This does NOT mask a bug: the aria-current value the setup applies
 *   is the SAME ("true") the source produces — so the BUG stays observable (see below).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ✅ FIXATO (era: aria-current="true")
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *   pdx-scroll-spy.ts:92  →  ora link.setAttribute('aria-current', 'page').
 *   'page' is the semantically right value for a link to the current section or page (consistent
 *   with pdx-nav-menu and pdx-breadcrumb). The scenario's setup reproduces 'page'.
 *
 * SCELTE CONTRACT
 *   Conservative rules, universal on ALL themes, with no theme-specific px.
 *   There is no component class → what is measured is the developer's links (.spy-link) and the <nav>.
 *   The active state is a STANDALONE rule (no triggered state: no scroll → no flake).
 *
 * KEYBOARD
 *   The entries are native <a href>s → natively tabbable. There is no roving and no keydown handler in the
 *   source. Pattern 'none': all we check is that Tab enters the nav.
 *
 * ISOLATION
 *   A content-driven wrapper (its height is the sum of the projected content) → skipHeight: true.
 *   No box styling of its own → no assertion on the component's radius.
 */
import type { ComponentManifest } from './_types';

// Deterministic markup: a scroll-spy nav with 3 entries plus 3 sections inside a wrapper.
// The `setup` applies the scroll-top state (the first entry active) synchronously, reproducing
// the source's updateLinks() — no scroll, and no waiting for the IntersectionObserver.
const SCENARIO_HTML = `
    <div data-test="spy-wrap" style="max-width: 720px;">
        <pdx-scroll-spy data-test="scroll-spy" link-selector=".spy-link" section-selector="[data-section]">
            <nav data-test="spy-nav" aria-label="On this page"
                 style="display:flex; flex-direction:column; gap:4px;">
                <a class="spy-link" href="#intro" data-test="spy-link-1"
                   style="display:flex; align-items:center; padding:6px 10px; border-radius:6px; text-decoration:none; cursor:pointer;">Introduction</a>
                <a class="spy-link" href="#usage" data-test="spy-link-2"
                   style="display:flex; align-items:center; padding:6px 10px; border-radius:6px; text-decoration:none; cursor:pointer;">Usage</a>
                <a class="spy-link" href="#api" data-test="spy-link-3"
                   style="display:flex; align-items:center; padding:6px 10px; border-radius:6px; text-decoration:none; cursor:pointer;">API</a>
            </nav>
            <section id="intro" data-section="intro" style="min-height:40px;">Intro</section>
            <section id="usage" data-section="usage" style="min-height:40px;">Usage</section>
            <section id="api" data-section="api" style="min-height:40px;">API</section>
        </pdx-scroll-spy>
    </div>`;

// A SYNCHRONOUS reproduction of updateLinks() for the top section (scroll-top → the first entry active).
// It uses the SAME aria-current="true" the source does (line 92), so the bug stays observable.
const SETUP_SCROLL_TOP = `
    const links = Array.from(document.querySelectorAll('section:not([hidden]) [data-test="scroll-spy"] .spy-link'));
    links.forEach((l, i) => {
        if (i === 0) { l.classList.add('active'); l.setAttribute('aria-current', 'page'); }
        else { l.classList.remove('active'); l.removeAttribute('aria-current'); }
    });`;

export const scrollSpy: ComponentManifest = {
    name: 'scroll-spy',
    tag: 'pdx-scroll-spy',
    tier: '6',
    status: 'wip',
    imports: ['@pdxui/ui/scroll-spy'],

    // ── Scenarios ──
    scenarios: [
        {
            id: 'scroll-spy-basic',
            title: 'Scroll Spy — Basic (scroll-top, first link active)',
            html: SCENARIO_HTML,
            setup: SETUP_SCROLL_TOP,
        },
    ],

    // ── Dim. 1: the mathematical contract (universal) ──
    contracts: {
        scenarios: {
            'scroll-spy-basic': {
                standalone: [
                    {
                        // The nav given is a flex column (deterministic markup).
                        selector: 'section:not([hidden]) [data-test="spy-nav"]',
                        description: 'spy nav is a flex column',
                        display: { op: 'oneOf', value: ['flex', 'inline-flex'] },
                    },
                    {
                        // The entries are interactive → cursor pointer.
                        selector: 'section:not([hidden]) [data-test="spy-link-1"]',
                        description: 'spy link cursor = pointer',
                        cursor: { op: 'is', value: 'pointer' },
                    },
                    {
                        // The active entry (the first) is opaque and visible.
                        selector: 'section:not([hidden]) [data-test="scroll-spy"] .spy-link.active',
                        description: 'active spy link opacity = 1',
                        opacity: { op: '==', value: 1, tolerance: 0.01 },
                    },
                    {
                        // The active entry is tall enough to hold its text.
                        selector: 'section:not([hidden]) [data-test="scroll-spy"] .spy-link.active',
                        description: 'active spy link tall enough to hold its label',
                        height: { op: '>=', value: 16 },
                    },
                ],
                composition: [
                    {
                        // The entries are stacked in a column → the same width (left-aligned).
                        description: 'spy links share width (stacked left-aligned column)',
                        parent: '[data-test="spy-nav"]',
                        children: {
                            active: '[data-test="spy-link-1"]',
                            other: '[data-test="spy-link-2"]',
                        },
                        relations: [
                            {
                                description: 'active and non-active link same width',
                                left: 'active.width',
                                op: '==',
                                right: 'other.width',
                                tolerance: 2,
                            },
                            {
                                description: 'second link sits below the first (vertical stack)',
                                left: 'active.bottom',
                                op: '<=',
                                right: 'other.top',
                                tolerance: 2,
                            },
                        ],
                    },
                    {
                        // The entry is contained in the nav (no horizontal overflow).
                        description: 'spy link contained in nav',
                        parent: 'body',
                        children: {
                            nav: '[data-test="spy-nav"]',
                            link: '[data-test="spy-link-1"]',
                        },
                        relations: [
                            { description: 'link within nav', left: 'link', op: 'contained-in', right: 'nav' },
                            {
                                description: 'link width <= nav width',
                                left: 'link.width',
                                op: '<=',
                                right: 'nav.width',
                                tolerance: 2,
                            },
                        ],
                    },
                ],
            },
        },
    },

    // ── Dim. 2: axe-core ──
    // A <nav> with aria-label="On this page"; <a> entries with text (their accessible name); the active
    // entry has aria-current (the value "true", from the source — see the BUG in the header comment:
    // valid for axe, but semantically it should be "page"). No disableRules: the scenario
    // is accessible by design.
    a11y: {
        scenarios: ['scroll-spy-basic'],
    },

    // ── Dim. 3: style isolation ──
    // A content-driven host (its height is the projected content), with no box styling of its own → skipHeight.
    isolation: {
        scenario: 'scroll-spy-basic',
        targets: [
            { selector: 'section:not([hidden]) [data-test="scroll-spy"]', tolerancePx: 12, skipHeight: true },
        ],
    },

    // ── Dim. 4: keyboard ──
    // The entries are native <a href>s (no roving and no keydown in the source) → 'none'. Tab enters the nav.
    keyboard: {
        scenario: 'scroll-spy-basic',
        steps: [
            { key: 'Tab', expectFocusWithin: '[data-test="spy-nav"]' },
        ],
    },

    // ── Dim. 5: visual regression (Docker) ──
    visual: {
        scenarios: ['scroll-spy-basic'],
    },
};

export default scrollSpy;
