// Pull-to-refresh — overscroll gesture to trigger refresh callback.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

export interface PullToRefreshOptions {
    /** Distance in px to trigger refresh. Default: 80. */
    threshold?: number;
    /** Max pull distance in px. Default: 150. */
    maxPull?: number;
    /** Resistance factor (0-1). Lower = harder to pull. Default: 0.4. */
    resistance?: number;
    /** Called when threshold is reached and released. Must return a Promise. */
    onRefresh: () => Promise<void>;
    /** Disable pull-to-refresh. */
    disabled?: () => boolean;
}

export interface PullToRefreshReturn {
    /** Current pull distance in px (reactive). */
    pullDistance: ReadonlySignal<number>;
    /** Pull progress 0-1 (reactive). */
    progress: ReadonlySignal<number>;
    /** Whether refresh is in progress (reactive). */
    isRefreshing: ReadonlySignal<boolean>;
    /** Whether the user is actively pulling (reactive). */
    isPulling: ReadonlySignal<boolean>;
    /** Cleanup. */
    dispose: Dispose;
}

/**
 * Pull-down-to-refresh, with the rubber-band resistance the gesture is recognised by.
 *
 * `progress` (0..1) is what an indicator rotates or fills with, and it is the reason `resistance`
 * (0.4) exists: the content follows the finger at less than 1:1, so passing the threshold feels like
 * an effort rather than an accident. Only fires when the container is already scrolled to the top.
 */
export function usePullToRefresh(
    el: () => HTMLElement | null,
    options: PullToRefreshOptions,
): PullToRefreshReturn {
    const threshold = options.threshold ?? 80;
    const maxPull = options.maxPull ?? 150;
    const resistance = options.resistance ?? 0.4;

    const _pullDistance = signal(0);
    const _progress = signal(0);
    const _isRefreshing = signal(false);
    const _isPulling = signal(false);

    let startY = 0;
    let pulling = false;

    function isAtTop(container: HTMLElement): boolean {
        return container.scrollTop <= 0;
    }

    function onTouchStart(e: TouchEvent): void {
        if (options.disabled?.()) return;
        if (_isRefreshing.peek()) return;
        const container = el();
        if (!container || !isAtTop(container)) return;

        startY = e.touches[0].clientY;
        pulling = false;
    }

    function onTouchMove(e: TouchEvent): void {
        if (options.disabled?.()) return;
        if (_isRefreshing.peek()) return;
        const container = el();
        if (!container) return;

        const currentY = e.touches[0].clientY;
        const rawDelta = currentY - startY;

        // Only pull down when at top
        if (rawDelta <= 0 || !isAtTop(container)) {
            if (pulling) { reset(); }
            return;
        }

        if (!pulling) {
            pulling = true;
            _isPulling.set(true);
        }

        e.preventDefault();

        // Apply resistance
        const delta = Math.min(maxPull, rawDelta * resistance);
        _pullDistance.set(delta);
        _progress.set(Math.min(1, delta / threshold));
    }

    function onTouchEnd(): void {
        if (!pulling) return;
        pulling = false;

        if (_pullDistance.peek() >= threshold && !_isRefreshing.peek()) {
            _isRefreshing.set(true);
            _isPulling.set(false);
            _pullDistance.set(threshold); // Hold at threshold during refresh

            options.onRefresh().finally(() => {
                _isRefreshing.set(false);
                reset();
            });
        } else {
            reset();
        }
    }

    function reset(): void {
        _pullDistance.set(0);
        _progress.set(0);
        _isPulling.set(false);
        pulling = false;
    }

    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const target = el();
            if (!target) return;

            target.addEventListener('touchstart', onTouchStart, { passive: true });
            target.addEventListener('touchmove', onTouchMove, { passive: false });
            target.addEventListener('touchend', onTouchEnd, { passive: true });

            return () => {
                target.removeEventListener('touchstart', onTouchStart);
                target.removeEventListener('touchmove', onTouchMove);
                target.removeEventListener('touchend', onTouchEnd);
            };
        });
    }

    return {
        pullDistance: _pullDistance as ReadonlySignal<number>,
        progress: _progress as ReadonlySignal<number>,
        isRefreshing: _isRefreshing as ReadonlySignal<boolean>,
        isPulling: _isPulling as ReadonlySignal<boolean>,
        dispose: () => { cleanupEffect?.(); },
    };
}
