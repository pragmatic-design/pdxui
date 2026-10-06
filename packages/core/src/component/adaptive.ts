// Adaptive Components — switch component behavior based on viewport/container.
// Select → BottomSheet on mobile, Dialog → Fullscreen on small screens.
// Signal-based: components react to viewport changes.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof window !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export type AdaptiveMode = 'desktop' | 'mobile';

export interface AdaptiveOptions {
    /** Breakpoint in px below which we switch to mobile mode. Default: 768. */
    breakpoint?: number;
    /** Use container width instead of viewport. */
    container?: () => HTMLElement | null;
    /** Force a specific mode (for testing). */
    forceMode?: AdaptiveMode;
}

export interface AdaptiveReturn {
    /** Current mode (reactive). */
    mode: ReadonlySignal<AdaptiveMode>;
    /** Whether mobile mode is active (reactive). */
    isMobile: ReadonlySignal<boolean>;
    /** Whether desktop mode is active (reactive). */
    isDesktop: ReadonlySignal<boolean>;
    /** Current width in px (reactive). */
    width: ReadonlySignal<number>;
}

// ─── Global viewport signal (singleton) ───────────────────────

const _viewportWidth = signal(isBrowser ? window.innerWidth : 1024);

if (isBrowser) {
    window.addEventListener('resize', () => {
        _viewportWidth.set(window.innerWidth);
    }, { passive: true });
}

// ─── useAdaptive ──────────────────────────────────────────────

/**
 * Determine adaptive mode based on viewport or container width.
 *
 * @example
 * const adaptive = useAdaptive({ breakpoint: 640 });
 *
 * // In template:
 * @if (adaptive.isMobile()) {
 *   <pdx-bottom-sheet>...</pdx-bottom-sheet>
 * } @else {
 *   <pdx-popover>...</pdx-popover>
 * }
 */
export function useAdaptive(options?: AdaptiveOptions): AdaptiveReturn {
    const breakpoint = options?.breakpoint ?? 768;

    if (options?.forceMode) {
        const forced = options.forceMode;
        return {
            mode: computed(() => forced),
            isMobile: computed(() => forced === 'mobile'),
            isDesktop: computed(() => forced === 'desktop'),
            width: computed(() => forced === 'mobile' ? breakpoint - 1 : breakpoint + 1),
        };
    }

    // Container-based (ResizeObserver)
    if (options?.container) {
        const _containerWidth = signal(0);

        if (isBrowser) {
            const ro = new ResizeObserver(entries => {
                for (const entry of entries) {
                    _containerWidth.set(entry.contentRect.width);
                }
            });

            // Observe when container becomes available
            let observed = false;
            const check = () => {
                const el = options.container!();
                if (el && !observed) {
                    ro.observe(el);
                    _containerWidth.set(el.clientWidth);
                    observed = true;
                }
            };
            check();
            // Re-check on next frame in case container isn't mounted yet
            if (!observed) requestAnimationFrame(check);
        }

        return {
            mode: computed(() => _containerWidth() < breakpoint ? 'mobile' : 'desktop'),
            isMobile: computed(() => _containerWidth() < breakpoint),
            isDesktop: computed(() => _containerWidth() >= breakpoint),
            width: _containerWidth as ReadonlySignal<number>,
        };
    }

    // Viewport-based (default)
    return {
        mode: computed(() => _viewportWidth() < breakpoint ? 'mobile' : 'desktop'),
        isMobile: computed(() => _viewportWidth() < breakpoint),
        isDesktop: computed(() => _viewportWidth() >= breakpoint),
        width: _viewportWidth as ReadonlySignal<number>,
    };
}

// ─── Adaptive map helper ──────────────────────────────────────

/**
 * Map a value based on adaptive mode.
 * Returns a computed signal that switches between desktop/mobile values.
 *
 * @example
 * const placement = adaptiveValue(adaptive, {
 *     desktop: 'bottom-start',
 *     mobile: 'bottom',
 * });
 * // placement() → 'bottom-start' or 'bottom' based on mode
 */
export function adaptiveValue<T>(
    adaptive: AdaptiveReturn,
    values: { desktop: T; mobile: T },
): ReadonlySignal<T> {
    return computed(() => adaptive.isMobile() ? values.mobile : values.desktop);
}
