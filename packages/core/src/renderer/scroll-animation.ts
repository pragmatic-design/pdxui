// Scroll-triggered animations — animate elements as they enter/exit viewport.
// Uses IntersectionObserver for performance. Signal-based progress.
// Used by: Timeline, Cards, Sections, Parallax.

import { signal, effect } from '../reactivity/signal';
import type { ReadonlySignal, Dispose } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Types ─────────────────────────────────────────────────────

export interface ScrollAnimationOptions {
    /** IntersectionObserver threshold (0-1). Default: 0.1 (10% visible). */
    threshold?: number | number[];
    /** Root margin. Default: '0px'. */
    rootMargin?: string;
    /** Only trigger once (don't re-animate on re-enter). Default: false. */
    once?: boolean;
    /** CSS class to add when in view. Default: 'pdx-in-view'. */
    inViewClass?: string;
    /** CSS class to add when out of view. Default: 'pdx-out-view'. */
    outViewClass?: string;
}

export interface ScrollAnimationReturn {
    /** Whether the element is in the viewport (reactive). */
    isInView: ReadonlySignal<boolean>;
    /** Intersection ratio 0-1 (reactive). */
    ratio: ReadonlySignal<number>;
    /** Whether the animation has triggered at least once. */
    hasTriggered: ReadonlySignal<boolean>;
    /** Cleanup. */
    dispose: Dispose;
}

// ─── useScrollAnimation ───────────────────────────────────────

/**
 * Reveal-on-scroll: toggles a class when an element enters the viewport, and reports the
 * intersection ratio.
 *
 * Uses IntersectionObserver, so it costs nothing per frame — unlike a scroll listener, which is the
 * usual way this gets written. `once: true` stops observing after the first entry, which is what a
 * one-shot reveal wants; leaving it false re-triggers on the way back.
 *
 * Respect `prefers-reduced-motion` in the CSS the class drives: this only adds the class.
 */
export function useScrollAnimation(
    el: () => HTMLElement | null,
    options?: ScrollAnimationOptions,
): ScrollAnimationReturn {
    const threshold = options?.threshold ?? 0.1;
    const rootMargin = options?.rootMargin ?? '0px';
    const once = options?.once ?? false;
    const inViewClass = options?.inViewClass ?? 'pdx-in-view';
    const outViewClass = options?.outViewClass ?? 'pdx-out-view';

    const _isInView = signal(false);
    const _ratio = signal(0);
    const _hasTriggered = signal(false);

    let observer: IntersectionObserver | null = null;
    let cleanupEffect: Dispose | null = null;

    if (isBrowser) {
        cleanupEffect = effect(() => {
            const target = el();
            if (!target) return;

            // Start with out-view class
            target.classList.add(outViewClass);

            observer = new IntersectionObserver(
                (entries) => {
                    for (const entry of entries) {
                        const inView = entry.isIntersecting;
                        _isInView.set(inView);
                        _ratio.set(entry.intersectionRatio);

                        if (inView) {
                            _hasTriggered.set(true);
                            target.classList.add(inViewClass);
                            target.classList.remove(outViewClass);

                            if (once) {
                                observer?.unobserve(target);
                            }
                        } else if (!once || !_hasTriggered.peek()) {
                            target.classList.remove(inViewClass);
                            target.classList.add(outViewClass);
                        }
                    }
                },
                { threshold, rootMargin },
            );

            observer.observe(target);

            return () => {
                observer?.disconnect();
                observer = null;
            };
        });
    }

    return {
        isInView: _isInView as ReadonlySignal<boolean>,
        ratio: _ratio as ReadonlySignal<number>,
        hasTriggered: _hasTriggered as ReadonlySignal<boolean>,
        dispose: () => {
            cleanupEffect?.();
            observer?.disconnect();
        },
    };
}

// ─── Shared Element Transition ────────────────────────────────

export interface SharedElementOptions {
    /** Duration in ms. Default: 300. */
    duration?: number;
    /** Easing. Default: 'ease'. */
    easing?: string;
}

/**
 * Animate an element from one position/size to another (FLIP technique).
 * Used for: list reorder, modal open from card, page transitions.
 *
 * @example
 * const first = captureRect(sourceEl);
 * // ... DOM changes (move element, change route) ...
 * animateSharedElement(targetEl, first, { duration: 400 });
 */
export function captureRect(el: HTMLElement): DOMRect {
    return el.getBoundingClientRect();
}

/**
 * FLIP-animate an element from where it WAS to where it is now.
 *
 * Capture the rect with {@link captureRect} before the DOM changes, then call this after: it applies
 * the inverse transform and animates it away, so the element appears to travel between the two
 * positions. That is how a thumbnail becomes a header image across a route change.
 *
 * Transform and opacity only — the properties the compositor can animate without layout — which is
 * why it stays smooth where animating `top`/`left` would not.
 */
export function animateSharedElement(
    el: HTMLElement,
    fromRect: DOMRect,
    options?: SharedElementOptions,
): Promise<void> {
    const duration = options?.duration ?? 300;
    const easing = options?.easing ?? 'ease';

    const toRect = el.getBoundingClientRect();

    const dx = fromRect.left - toRect.left;
    const dy = fromRect.top - toRect.top;
    const sw = fromRect.width / toRect.width;
    const sh = fromRect.height / toRect.height;

    const animation = el.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${sw}, ${sh})`, transformOrigin: 'top left' },
        { transform: 'translate(0, 0) scale(1, 1)', transformOrigin: 'top left' },
    ], { duration, easing, fill: 'none' });

    return animation.finished.then(() => {});
}
