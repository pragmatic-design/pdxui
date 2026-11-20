// Centralized Viewport & Screen Signals — one listener, many readers.
// Components read these signals instead of creating their own resize/matchMedia listeners.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof window !== 'undefined';

// ─── Viewport Signals (resize + scroll) ───────────────────────────

/** The viewport's size and scroll, each a signal: what {@link viewport} holds. */
export interface ViewportSignals {
    width: ReadonlySignal<number>;
    height: ReadonlySignal<number>;
    scrollY: ReadonlySignal<number>;
    scrollX: ReadonlySignal<number>;
}

// Created on the first read of a `viewport` member, with the two listeners (#1246): an app that
// never reads the viewport adds no `resize` or `scroll` listener. The values are read then, as a setup
// at load would have read them at that moment.
let _viewport: ViewportSignals | null = null;

function viewportSignals(): ViewportSignals {
    if (_viewport) return _viewport;
    const width = signal(isBrowser ? window.innerWidth : 1024);
    const height = signal(isBrowser ? window.innerHeight : 768);
    const scrollY = signal(isBrowser ? window.scrollY : 0);
    const scrollX = signal(isBrowser ? window.scrollX : 0);
    if (isBrowser) {
        window.addEventListener('resize', () => {
            width.set(window.innerWidth);
            height.set(window.innerHeight);
        }, { passive: true });
        window.addEventListener('scroll', () => {
            scrollY.set(window.scrollY);
            scrollX.set(window.scrollX);
        }, { passive: true });
    }
    return (_viewport = {
        width: computed(() => width()),
        height: computed(() => height()),
        scrollY: computed(() => scrollY()),
        scrollX: computed(() => scrollX()),
    });
}

/** Centralized viewport signals. One resize listener, many readers; set up on the first read. */
export const viewport: Readonly<ViewportSignals> = {
    get width() { return viewportSignals().width; },
    get height() { return viewportSignals().height; },
    get scrollY() { return viewportSignals().scrollY; },
    get scrollX() { return viewportSignals().scrollX; },
};

// ─── Screen Signals (media queries) ──────────────────────────────

/** One signal per query, created on its first read with its `change` listener (#1246). */
const _media = new Map<string, ReadonlySignal<boolean>>();

function mediaSignal(query: string): ReadonlySignal<boolean> {
    let read = _media.get(query);
    if (read) return read;
    if (!isBrowser) {
        read = computed(() => false);
    } else {
        const mql = window.matchMedia(query);
        const sig = signal(mql.matches);
        mql.addEventListener('change', (e) => sig.set(e.matches));
        read = computed(() => sig());
    }
    _media.set(query, read);
    return read;
}

/** Centralized screen/device signals. One matchMedia listener per query, set up on its first read. */
export const screen = {
    /** Portrait orientation. */
    get isPortrait() { return mediaSignal('(orientation: portrait)'); },
    /** Landscape orientation. */
    get isLandscape() { return mediaSignal('(orientation: landscape)'); },
    /** User prefers reduced motion. */
    get prefersReducedMotion() { return mediaSignal('(prefers-reduced-motion: reduce)'); },
    /** User prefers dark color scheme. */
    get prefersDark() { return mediaSignal('(prefers-color-scheme: dark)'); },
    /** Touch-primary input device. */
    get isTouch() { return mediaSignal('(pointer: coarse)'); },
    /** High contrast mode. */
    get prefersContrast() { return mediaSignal('(prefers-contrast: more)'); },
    /** Device pixel ratio ≥ 2 (retina). */
    get isHighDpi() { return mediaSignal('(min-resolution: 2dppx)'); },
} as const;

// ─── Adaptive Feature Flags ──────────────────────────────────────

/**
 * Define adaptive feature flags based on viewport/screen conditions.
 * Each flag is a computed signal. The system also writes active flags
 * as a `pdx-adaptive` attribute on `<html>` for CSS targeting.
 *
 * @param flags - Record of flag name → condition function
 * @returns Record of flag name → ReadonlySignal<boolean>
 *
 * Usage:
 *   const features = adaptive({
 *     compactNav: () => viewport.width() < 768,
 *     touchOptimized: () => screen.isTouch(),
 *   });
 *   // <html pdx-adaptive="compactNav touchOptimized">
 */
export function adaptive(
    flags: Record<string, () => boolean>
): Record<string, ReadonlySignal<boolean>> {
    const result: Record<string, ReadonlySignal<boolean>> = {};
    const computedFlags: { name: string; sig: ReadonlySignal<boolean> }[] = [];

    for (const [name, conditionFn] of Object.entries(flags)) {
        const sig = computed(conditionFn);
        result[name] = sig;
        computedFlags.push({ name, sig });
    }

    // Sync active flags to <html> attribute for CSS targeting
    if (isBrowser) {
        const el = document.documentElement;
        // Use a single effect that reads all flags
        computed(() => {
            const active = computedFlags
                .filter(f => f.sig())
                .map(f => f.name)
                .join(' ');
            el.setAttribute('pdx-adaptive', active);
            return active;
        });
        // Force initial evaluation
        const initial = computedFlags.filter(f => f.sig()).map(f => f.name).join(' ');
        el.setAttribute('pdx-adaptive', initial);
    }

    return result;
}
