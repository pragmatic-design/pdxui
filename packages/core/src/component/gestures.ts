// Gesture recognition — swipe, longpress, pinch via PointerEvents.
// Works on touch + mouse + pen. SSR-safe (no-op without DOM).

import type { Dispose } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

export interface SwipeConfig {
    /** Minimum distance in px to trigger swipe. Default: 50 */
    threshold?: number;
    /** Maximum time in ms for the swipe gesture. Default: 300 */
    timeout?: number;
}

export interface LongpressConfig {
    /** Hold duration in ms before triggering. Default: 500 */
    duration?: number;
    /** Max movement in px before cancelling. Default: 10 */
    tolerance?: number;
}

export interface PinchEvent {
    /** Scale factor relative to start (1.0 = no change, 2.0 = doubled). */
    scale: number;
    /** Center point between the two touches. */
    center: { x: number; y: number };
}

// ─── Swipe ──────────────────────────────────────────────────────────

/**
 * Listen for swipe gestures on an element.
 * Uses PointerEvents for unified touch/mouse/pen support.
 *
 * @returns Dispose function to remove listeners.
 */
export function onSwipe(
    el: HTMLElement,
    direction: SwipeDirection,
    callback: () => void,
    config?: SwipeConfig,
): Dispose {
    if (typeof window === 'undefined') return () => {};

    const threshold = config?.threshold ?? 50;
    const timeout = config?.timeout ?? 300;

    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const onDown = (e: PointerEvent) => {
        startX = e.clientX;
        startY = e.clientY;
        startTime = Date.now();
    };

    const onUp = (e: PointerEvent) => {
        if (Date.now() - startTime > timeout) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        // Determine dominant axis
        const isHorizontal = absDx > absDy;

        if (isHorizontal && absDx >= threshold) {
            const detected = dx < 0 ? 'left' : 'right';
            if (detected === direction) callback();
        } else if (!isHorizontal && absDy >= threshold) {
            const detected = dy < 0 ? 'up' : 'down';
            if (detected === direction) callback();
        }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);

    return () => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointerup', onUp);
    };
}

// ─── Longpress ──────────────────────────────────────────────────────

/**
 * Listen for longpress (hold) gestures on an element.
 *
 * @returns Dispose function to remove listeners.
 */
export function onLongpress(
    el: HTMLElement,
    callback: (e: PointerEvent) => void,
    config?: LongpressConfig,
): Dispose {
    if (typeof window === 'undefined') return () => {};

    const duration = config?.duration ?? 500;
    const tolerance = config?.tolerance ?? 10;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    let startEvent: PointerEvent | null = null;

    const onDown = (e: PointerEvent) => {
        startX = e.clientX;
        startY = e.clientY;
        startEvent = e;
        timer = setTimeout(() => {
            if (startEvent) callback(startEvent);
            timer = null;
        }, duration);
    };

    const onMove = (e: PointerEvent) => {
        if (!timer) return;
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx > tolerance || dy > tolerance) {
            clearTimeout(timer);
            timer = null;
        }
    };

    const onUp = () => {
        if (timer) { clearTimeout(timer); timer = null; }
        startEvent = null;
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    return () => {
        if (timer) clearTimeout(timer);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
    };
}

// ─── Pinch ──────────────────────────────────────────────────────────

/**
 * Listen for pinch (two-finger scale) gestures on an element.
 * Only fires on touch devices with multi-touch support.
 *
 * @returns Dispose function to remove listeners.
 */
export function onPinch(
    el: HTMLElement,
    callback: (event: PinchEvent) => void,
): Dispose {
    if (typeof window === 'undefined') return () => {};

    const pointers = new Map<number, PointerEvent>();
    let startDistance = 0;
    // touch-action must be disabled only DURING the pinch (2 active pointers), not
    // at registration time: setting it forever kills native pan/scroll.
    const prevTouchAction = el.style.touchAction;

    const getDistance = (): number => {
        const pts = [...pointers.values()];
        if (pts.length < 2) return 0;
        const dx = pts[1].clientX - pts[0].clientX;
        const dy = pts[1].clientY - pts[0].clientY;
        return Math.hypot(dx, dy);
    };

    const getCenter = (): { x: number; y: number } => {
        const pts = [...pointers.values()];
        if (pts.length < 2) return { x: 0, y: 0 };
        return {
            x: (pts[0].clientX + pts[1].clientX) / 2,
            y: (pts[0].clientY + pts[1].clientY) / 2,
        };
    };

    const onDown = (e: PointerEvent) => {
        pointers.set(e.pointerId, e);
        if (pointers.size === 2) {
            startDistance = getDistance();
            el.setPointerCapture?.(e.pointerId);
            el.style.touchAction = 'none';
        }
    };

    const onMove = (e: PointerEvent) => {
        pointers.set(e.pointerId, e);
        if (pointers.size === 2 && startDistance > 0) {
            const currentDistance = getDistance();
            callback({
                scale: currentDistance / startDistance,
                center: getCenter(),
            });
        }
    };

    const onUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) {
            startDistance = 0;
            el.style.touchAction = prevTouchAction;
        }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);

    return () => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.style.touchAction = prevTouchAction;
    };
}
