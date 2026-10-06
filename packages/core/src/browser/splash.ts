// The start-up splash: when it leaves, and how.
//
// The splash itself is HTML — the compiler writes it into `index.html` (`pdx({ splash })`), so it is
// painted before any JavaScript has run. This module is the other half: it takes it away once the
// app is READY, not once it has merely mounted. Ready is every condition handed to `splashReady()`
// settled and the document parsed; the router hands it the first page it shows, and an app can add
// its own (its first data, say).
//
// Leaving is one fade, 200 ms, and a removal on `transitionend` — or a removal at once when the
// computed transition is none, which is what `prefers-reduced-motion: reduce` gives it. Until then
// `<body aria-busy="true">` says the page is being built, and the splash is `aria-hidden`.

/** The id the compiler gives the splash element. */
export const SPLASH_ID = 'pdx-splash';

/** The class that starts the fade. The compiler's inline style defines what it does. */
export const SPLASH_LEAVING_CLASS = 'pdx-splash-leaving';

const pending = new Set<Promise<unknown>>();
let loaded = false;
let leaving = false;

function splashElement(): HTMLElement | null {
    return typeof document === 'undefined' ? null : document.getElementById(SPLASH_ID);
}

/** Whether the start-up splash is on screen and not yet leaving: the app's first frames are its. */
export function isSplashUp(): boolean {
    return !leaving && splashElement() !== null;
}

/**
 * Hold the splash until `condition` settles.
 *
 * Settled either way: a condition that fails is the app's to report, on its own screen — a splash
 * that never leaves reports nothing. A condition handed over once the splash has gone is ignored.
 */
export function splashReady(condition: PromiseLike<unknown>): void {
    if (leaving || typeof document === 'undefined') return;
    const held = Promise.resolve(condition);
    pending.add(held);
    const settle = () => { pending.delete(held); maybeLeave(); };
    held.then(settle, settle);
}

function maybeLeave(): void {
    if (leaving || !loaded || pending.size > 0) return;
    leaving = true;
    document.body?.removeAttribute('aria-busy');
    const el = splashElement();
    if (!el) return;
    // `minDuration`, when the app declared one, is counted from the navigation's start.
    const min = Number(el.dataset.minDuration) || 0;
    const wait = Math.max(0, min - performance.now());
    const go = () => requestAnimationFrame(() => fadeOut(el));
    if (wait > 0) setTimeout(go, wait); else go();
}

/** The longest of a computed `transition-duration` list, in ms: `0.2s`, `200ms`, `1e-05s, 0s`. */
function durationMs(value: string): number {
    let longest = 0;
    for (const part of value.split(',')) {
        const n = parseFloat(part) || 0;
        longest = Math.max(longest, part.trim().endsWith('ms') ? n : n * 1000);
    }
    return longest;
}

/** The fade, or at once when there is no transition to wait for. */
function fadeOut(el: HTMLElement): void {
    el.classList.add(SPLASH_LEAVING_CLASS);
    // No transition to wait for: none declared, or a token one. The design system's reduced-motion
    // rule sets every duration to 0.01ms !important rather than to 0 (adaptive.css), and with the
    // property `none` there is no `transitionend` to wait for at all.
    const cs = getComputedStyle(el);
    if (cs.transitionProperty === 'none' || durationMs(cs.transitionDuration) < 1) { el.remove(); return; }
    el.addEventListener('transitionend', () => el.remove(), { once: true });
}

// «Loaded» is DOMContentLoaded, not `load`: what it stands for is that the entry's modules have run
// and handed their conditions over, and module scripts run before DOMContentLoaded. `load` also
// waits for every image, font and preload — measured on the showcase, it held the splash ~300 ms
// past the page.
if (typeof document !== 'undefined') {
    const onLoad = () => { loaded = true; maybeLeave(); };
    // Already parsed — a module evaluated late: a task, not a microtask, so the code that imported
    // this module has handed its conditions over before the splash decides it has none.
    if (document.readyState !== 'loading') setTimeout(onLoad, 0);
    else document.addEventListener('DOMContentLoaded', onLoad, { once: true });
}
