// Centralized Viewport & Screen Signals — one listener, many readers.
// Components read these signals instead of creating their own resize/matchMedia listeners.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof window !== 'undefined';

// ─── Viewport Signals (resize + scroll) ───────────────────────────

const _width = signal(isBrowser ? window.innerWidth : 1024);
const _height = signal(isBrowser ? window.innerHeight : 768);
const _scrollY = signal(isBrowser ? window.scrollY : 0);
const _scrollX = signal(isBrowser ? window.scrollX : 0);

/** Centralized viewport signals. One resize listener, many readers. */
export const viewport = {
    width: computed(() => _width()) as ReadonlySignal<number>,
    height: computed(() => _height()) as ReadonlySignal<number>,
    scrollY: computed(() => _scrollY()) as ReadonlySignal<number>,
    scrollX: computed(() => _scrollX()) as ReadonlySignal<number>,
} as const;

// Install global listeners. Module-level code runs once per module instance, so no extra guard flag
// is needed (an ESM re-import returns the cached module without re-executing this).
if (isBrowser) {
    window.addEventListener('resize', () => {
        _width.set(window.innerWidth);
        _height.set(window.innerHeight);
    }, { passive: true });

    window.addEventListener('scroll', () => {
        _scrollY.set(window.scrollY);
        _scrollX.set(window.scrollX);
    }, { passive: true });
}

// ─── Screen Signals (media queries) ──────────────────────────────

function mediaSignal(query: string): ReadonlySignal<boolean> {
    if (!isBrowser) return computed(() => false);
    const mql = window.matchMedia(query);
    const sig = signal(mql.matches);
    mql.addEventListener('change', (e) => sig.set(e.matches));
    return computed(() => sig());
}

/** Centralized screen/device signals. One matchMedia listener per query. */
export const screen = {
    /** Portrait orientation. */
    isPortrait: mediaSignal('(orientation: portrait)'),
    /** Landscape orientation. */
    isLandscape: mediaSignal('(orientation: landscape)'),
    /** User prefers reduced motion. */
    prefersReducedMotion: mediaSignal('(prefers-reduced-motion: reduce)'),
    /** User prefers dark color scheme. */
    prefersDark: mediaSignal('(prefers-color-scheme: dark)'),
    /** Touch-primary input device. */
    isTouch: mediaSignal('(pointer: coarse)'),
    /** High contrast mode. */
    prefersContrast: mediaSignal('(prefers-contrast: more)'),
    /** Device pixel ratio ≥ 2 (retina). */
    isHighDpi: mediaSignal('(min-resolution: 2dppx)'),
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
