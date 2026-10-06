// The in-page oracle: measure the previewed scenario and return a verdict.
//
// This is what makes the builder a judge rather than a viewer, and it is the piece the
// agent loop needs: no rebuild, no Playwright, no driver — `setTheme()` → `report()` in
// milliseconds. r$'s browser collector was built for exactly this (`collect.root`), so the
// parent measures INSIDE the iframe at a simulated viewport.

import { analyzeDOM, type UnifiedReport } from '@responsivejs/design/browser';

/**
 * What we measure, inside the visible scenario only.
 *
 * Not `*`: the constraints are typed. WCAG contrast applies to things that carry text and
 * target-size to things you can hit — measuring every span and wrapper would bury a real
 * failure under noise about layout divs, which is how an oracle stops being read.
 */
export const TEXT_SELECTORS = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'label', 'li', 'td', 'th', 'summary', 'legend', 'figcaption',
];

export const INTERACTIVE_SELECTORS = [
    'button', 'a[href]', 'input', 'select', 'textarea',
    '[role="button"]', '[role="tab"]', '[role="menuitem"]', '[role="switch"]', '[role="checkbox"]',
];

export const ORACLE_SELECTORS = [...TEXT_SELECTORS, ...INTERACTIVE_SELECTORS];

/**
 * MAKING r$ SEE OUR COLOURS.
 *
 * r$'s collector resolves the effective background with a LOCAL regex that matches only
 * `rgb()`/`rgba()` (`browser/inject.js`, `parseRgb`) — its full `parseColor` does handle
 * `oklch()`, but the ancestor walk does not use it. Every one of our backgrounds is
 * `oklch()`, so the walk never finds an opaque layer, falls through to the default white
 * canvas, and compares text against white: `.pdx-primary` measures 1.06:1 and `.pdx-danger`
 * 1.00:1, where the true ratios are 10.67:1 and 5.38:1. Unshimmed, the contrast rule is unusable
 * and the colour half of the aesthetic score is fed white for every filled surface.
 *
 * The real fix belongs upstream, in a repository this one does not contain. Until it lands,
 * the collector is given what it can read: `getComputedStyle` is wrapped INSIDE the preview
 * so `color` and `background-color` come back as `rgb()`. That is the single point r$ reads
 * colour from, so nothing else has to change.
 *
 * The conversion is the browser's own: paint the colour on a 1x1 canvas and read the pixel.
 * Not a reimplementation of OKLCH — the same pipeline that put the colour on screen, gamut
 * mapping included, alpha preserved (`oklch(… / 0.3)` → `rgba(195, 23, 89, 0.3)`).
 *
 * This is a correction, not a workaround dressed up: r$ reads white where the page is
 * charcoal. When the upstream parser lands, `needsColourShim` goes false on its own and this
 * whole path can be deleted.
 */

/** True while r$ still cannot read an `oklch()` background. Probes, never assumes. */
export function needsColourShim(doc: Document): boolean {
    const probe = doc.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;background-color:oklch(0.35 0.02 260)';
    doc.body.appendChild(probe);
    const seen = doc.defaultView?.getComputedStyle(probe).backgroundColor ?? '';
    probe.remove();
    return seen.includes('oklch');
}

/**
 * Reference-counted, because measurements overlap: the frame's load handler starts one and
 * a caller can start another before it finishes. Installing and restoring per call would let the
 * FIRST to finish restore the real getComputedStyle while the second is still measuring,
 * so r$ would go back to reading `oklch()` mid-run and invent a contrast failure. Intermittent
 * and only in the harness, which is exactly the kind of thing that gets blamed on the test.
 */
let shimDepth = 0;
let shimUndo: (() => void) | null = null;
let shimDoc: Document | null = null;

function acquireColourShim(doc: Document): () => void {
    // Keyed on the DOCUMENT: the frame navigates, and a measurement left in flight on the
    // old one would otherwise keep the counter above zero forever, so the new document would
    // never be shimmed and r$ would silently go back to reading white.
    if (shimDoc !== doc) {
        shimDepth = 0;
        shimUndo = null;
        shimDoc = doc;
    }
    if (shimDepth === 0) shimUndo = installColourShim(doc);
    shimDepth++;
    return () => {
        if (shimDoc !== doc) return;   // that document is gone; nothing to restore
        shimDepth--;
        if (shimDepth === 0) { shimUndo?.(); shimUndo = null; }
    };
}

/**
 * Measure the page AT REST.
 *
 * A property with a `transition` reports its ANIMATED value while the transition runs, so a
 * measurement taken just after something changed reads a colour that exists for 150ms and
 * belongs to no state: repairing a sabotaged label and measuring straight away gave 1.86:1,
 * a point on the way back rather than either endpoint. Freezing snaps every element to its
 * target, which is the state a verdict should be about.
 *
 * The repo already knew this — `packages/responsive/tests` carries a `freezeAnimations` for
 * exactly the same reason. This is the in-page twin.
 */
const FREEZE_ID = 'pdx-builder-freeze';

function freezeAnimations(doc: Document): () => void {
    const el = doc.createElement('style');
    el.id = FREEZE_ID;
    el.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
    doc.head.appendChild(el);
    // Force a style recalculation so the freeze is in effect before anything is measured.
    void doc.documentElement.offsetHeight;
    return () => el.remove();
}

/** Wrap the preview's getComputedStyle so colours read as rgb(). Returns the undo. */
function installColourShim(doc: Document): (() => void) | null {
    const win = doc.defaultView as (Window & typeof globalThis) | null;
    const canvas = doc.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!win || !ctx) return null;

    const cache = new Map<string, string>();
    const toRgb = (value: string): string => {
        const hit = cache.get(value);
        if (hit !== undefined) return hit;
        ctx.clearRect(0, 0, 1, 1);
        // Seed with a known value: an unparseable assignment leaves fillStyle untouched, so
        // without this a bad string would silently inherit the previous colour.
        ctx.fillStyle = '#000000';
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
        const alpha = a / 255;
        const out = alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        cache.set(value, out);
        return out;
    };

    const original = win.getComputedStyle;
    win.getComputedStyle = function (this: Window, el: Element, pseudo?: string | null) {
        const cs = original.call(this, el, pseudo);
        return new Proxy(cs, {
            get(target, key) {
                const value = Reflect.get(target, key);
                if (typeof value === 'function') return value.bind(target);
                if ((key === 'backgroundColor' || key === 'color')
                    && typeof value === 'string' && value.includes('oklch')) {
                    return toRgb(value);
                }
                return value;
            },
        });
    } as typeof win.getComputedStyle;

    return () => { win.getComputedStyle = original; };
}

export const COLOUR_SHIMMED_NOTE =
    'Colour IS judged: rendered contrast is measured on every text and interactive element. '
    + 'r$ cannot read oklch() backgrounds on its own, so the preview reports colours as rgb() '
    + 'for the measurement — converted by the browser itself, so it is the colour on screen.';

export const COLOUR_NATIVE_NOTE =
    'Colour IS judged: rendered contrast is measured on every text and interactive element, '
    + 'natively — r$ reads our oklch() colours directly, so the compatibility shim is off.';

export interface OracleContext {
    component: string;
    scenario: string;
    theme: string;
    scheme: string;
    /** 0 = the stage's own width. */
    width: number;
}

export interface BuilderReport extends OracleContext {
    /** No error-severity violation. */
    pass: boolean;
    /** No violation at all, not even a warning. */
    clean: boolean;
    /** Checks performed / passed / failed. */
    total: number;
    passed: number;
    failed: number;
    errors: number;
    warnings: number;
    info: number;
    byRule: Record<string, number>;
    /** Aesthetic overall, 0..1. Undefined when scoring is off or unavailable. */
    aesthetic?: number;
    violations: {
        rule: string;
        element?: string;
        detail: string;
        severity: 'error' | 'warning' | 'info';
        suggestion?: string;
    }[];
    /** Apply-verbatim fixes r$ is confident about. */
    fixes: unknown[];
    durationMs: number;
    /** What this verdict does and does not cover. Never empty. */
    notes: string[];
    /** Set when the preview could not be measured at all. */
    error?: string;
}

/**
 * What to measure inside the preview.
 *
 * A generated scenario page hides every section but the selected one, so the visible section
 * is the subject. The composite page has no sections — it IS the subject,
 * so the body is the right scope there. Without the fallback the oracle reported "no
 * scenario section" and measured nothing on the one page a theme is judged by eye.
 */
export function activeSection(doc: Document): Element | null {
    return doc.querySelector('section[data-scenario]:not([hidden])')
        ?? doc.querySelector('section[data-scenario]')
        ?? doc.body;
}

/**
 * Inject (or replace) a stylesheet inside the preview document.
 *
 * Theme mode needs this to apply a generated theme without a rebuild; the oracle's tests need it
 * to prove the oracle is not vacuous, by breaking a theme on purpose and watching the verdict move.
 * Note it does NOT settle the open `GeneratedTheme.apply(root?)` question — that is about
 * the engine's convenience API, and a generated theme's `toCSS()` lands here either way.
 */
export function injectCss(doc: Document, css: string, id = 'pdx-builder-injected'): void {
    let el = doc.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
        el = doc.createElement('style');
        el.id = id;
        doc.head.appendChild(el);
    }
    el.textContent = css;
}

export function clearCss(doc: Document, id = 'pdx-builder-injected'): void {
    doc.getElementById(id)?.remove();
}

function toReport(raw: UnifiedReport, ctx: OracleContext, shimmed: boolean): BuilderReport {
    return {
        ...ctx,
        pass: raw.pass,
        clean: raw.clean,
        total: raw.total,
        passed: raw.passed,
        failed: raw.failed,
        errors: raw.summary.errors,
        warnings: raw.summary.warnings,
        info: raw.summary.info,
        byRule: raw.summary.byRule,
        aesthetic: raw.scores?.average.overall,
        violations: raw.violations.map(v => ({
            rule: v.rule,
            element: v.element ?? v.elements?.[0],
            detail: v.detail,
            severity: v.severity ?? 'error',
            suggestion: v.suggestion,
        })),
        fixes: raw.fixes,
        notes: [shimmed ? COLOUR_SHIMMED_NOTE : COLOUR_NATIVE_NOTE],
        durationMs: raw.durationMs,
    };
}

/** Measure the live preview. Returns a report even on failure, with `error` set. */
export function runOracle(frame: HTMLIFrameElement, ctx: OracleContext): BuilderReport {
    const empty: BuilderReport = {
        ...ctx, pass: false, clean: false, total: 0, passed: 0, failed: 0,
        errors: 0, warnings: 0, info: 0, byRule: {}, violations: [], fixes: [],
        // Nothing was measured, so nothing is claimed about colour either.
        notes: [COLOUR_SHIMMED_NOTE], durationMs: 0,
    };

    const doc = frame.contentDocument;
    if (!doc) return { ...empty, error: 'preview not readable (not same-origin?)' };
    if (!doc.documentElement.hasAttribute('data-pdx-ready')) {
        return { ...empty, error: 'preview has not finished mounting' };
    }
    const root = activeSection(doc);
    if (!root) return { ...empty, error: 'the preview has no body to measure' };

    const undoShim = needsColourShim(doc) ? acquireColourShim(doc) : null;
    const unfreeze = freezeAnimations(doc);
    try {
        const raw = analyzeDOM(ORACLE_SELECTORS, {
            collect: {
                root,
                // The measured viewport is the FRAME's, not the builder window's — otherwise
                // every width-dependent rule would judge the wrong layout.
                width: frame.clientWidth || undefined,
                height: frame.clientHeight || undefined,
            },
            constraints: {
                noOverflow: true,
                touchTarget: { selectors: INTERACTIVE_SELECTORS, min: 24 },
                contrast: { selectors: TEXT_SELECTORS.concat(INTERACTIVE_SELECTORS), level: 'AA' },
            },
        });
        return toReport(raw, ctx, !!undoShim);
    } catch (err) {
        return { ...empty, error: String((err as Error)?.message ?? err) };
    } finally {
        // Always restore: the preview is a live page, not a fixture.
        unfreeze();
        undoShim?.();
    }
}
