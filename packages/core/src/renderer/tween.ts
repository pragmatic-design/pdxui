// Tween — animate signal values over time with easing.
// Produces a reactive signal that smoothly transitions between values.
// Complements spring.ts (CSS-only) with JS runtime animation.

import { signal, effect, computed } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface TweenConfig {
    /** Duration in ms. Default: 300. */
    duration?: number;
    /** Easing function. Default: easeOutCubic. */
    easing?: (t: number) => number;
}

export interface TweenSignal extends ReadonlySignal<number> {
    /** Whether the tween is currently animating. */
    animating: ReadonlySignal<boolean>;
    /** Dispose — stop animation and cleanup. */
    dispose: Dispose;
}

// ─── Built-in easings ──────────────────────────────────────────────

/**
 * The easing curves `tween()` accepts, as plain `(t: number) => number` on 0..1.
 *
 * Prefer an `easeOut*` for anything the user triggered: it moves fastest at the start, so the
 * interface feels like it responded immediately. `easeInOut*` suits something moving on its own,
 * `linear` suits a progress bar and almost nothing else.
 *
 * Any function of the same shape works — this is a convenience set, not a closed list.
 */
export const easings = {
    linear: (t: number) => t,
    easeInQuad: (t: number) => t * t,
    easeOutQuad: (t: number) => t * (2 - t),
    easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t: number) => t * t * t,
    easeOutCubic: (t: number) => (--t) * t * t + 1,
    easeInOutCubic: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
    easeOutElastic: (t: number) => {
        const p = 0.3;
        return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
    },
    easeOutBounce: (t: number) => {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    },
} as const;

// ─── tween() ───────────────────────────────────────────────────────

/**
 * Animate a numeric signal smoothly between values.
 * When the target signal changes, the tween interpolates over duration.
 *
 * Usage:
 *   const target = signal(0);
 *   const smooth = tween(() => target());
 *   target.set(100); // smooth animates 0→100 over 300ms
 *
 *   effect(() => {
 *     element.style.transform = `translateX(${smooth()}px)`;
 *   });
 */
export function tween(
    target: () => number,
    config?: TweenConfig,
): TweenSignal {
    const duration = config?.duration ?? 300;
    const easing = config?.easing ?? easings.easeOutCubic;

    const _value = signal<number>(target());
    const _animating = signal(false);

    let startValue = target();
    let endValue = startValue;
    let startTime = 0;
    let rafId = 0;

    function tick(): void {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easing(progress);
        const current = startValue + (endValue - startValue) * eased;

        _value.set(current as never);

        if (progress < 1) {
            rafId = requestAnimationFrame(tick);
        } else {
            _value.set(endValue as never);
            _animating.set(false as never);
        }
    }

    const dispose = effect(() => {
        const newTarget = target();

        if (newTarget !== endValue) {
            startValue = _value.peek();
            endValue = newTarget;
            startTime = performance.now();

            if (rafId) cancelAnimationFrame(rafId);
            _animating.set(true as never);
            rafId = requestAnimationFrame(tick);
        }
    });

    const readable = (() => _value()) as TweenSignal;
    readable.peek = () => _value.peek();
    readable.animating = computed(() => _animating());
    readable.dispose = () => {
        dispose();
        if (rafId) cancelAnimationFrame(rafId);
    };

    return readable;
}

// ─── tweenMulti() — animate multiple values ─────────────────────

export interface TweenMultiSignal<K extends string> extends ReadonlySignal<Record<K, number>> {
    animating: ReadonlySignal<boolean>;
    dispose: Dispose;
}

/**
 * Animate multiple numeric values simultaneously.
 *
 * Usage:
 *   const pos = tweenMulti({ x: () => targetX(), y: () => targetY() }, { duration: 500 });
 *   effect(() => {
 *     const { x, y } = pos();
 *     el.style.transform = `translate(${x}px, ${y}px)`;
 *   });
 */
export function tweenMulti<K extends string>(
    targets: Record<K, () => number>,
    config?: TweenConfig,
): TweenMultiSignal<K> {
    const duration = config?.duration ?? 300;
    const easing = config?.easing ?? easings.easeOutCubic;

    const keys = Object.keys(targets) as K[];
    const startValues: Record<string, number> = {};
    const endValues: Record<string, number> = {};
    const current: Record<string, number> = {};

    for (const k of keys) {
        const v = targets[k]();
        startValues[k] = v;
        endValues[k] = v;
        current[k] = v;
    }

    const _value = signal<Record<K, number>>({ ...current } as Record<K, number>);
    const _animating = signal(false);
    let startTime = 0;
    let rafId = 0;

    function tick(): void {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easing(progress);

        for (const k of keys) {
            current[k] = startValues[k] + (endValues[k] - startValues[k]) * eased;
        }

        _value.set({ ...current } as never);

        if (progress < 1) {
            rafId = requestAnimationFrame(tick);
        } else {
            for (const k of keys) current[k] = endValues[k];
            _value.set({ ...current } as never);
            _animating.set(false as never);
        }
    }

    const dispose = effect(() => {
        let changed = false;
        for (const k of keys) {
            const newVal = targets[k]();
            if (newVal !== endValues[k]) {
                startValues[k] = current[k];
                endValues[k] = newVal;
                changed = true;
            }
        }

        if (changed) {
            startTime = performance.now();
            if (rafId) cancelAnimationFrame(rafId);
            _animating.set(true as never);
            rafId = requestAnimationFrame(tick);
        }
    });

    const readable = (() => _value()) as TweenMultiSignal<K>;
    readable.peek = () => _value.peek();
    readable.animating = computed(() => _animating());
    readable.dispose = () => {
        dispose();
        if (rafId) cancelAnimationFrame(rafId);
    };

    return readable;
}
