// RTL — direction detection signal + CSS logical property helpers.
// Used by all components to support right-to-left layouts.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Direction signal ─────────────────────────────────────────

const _dir = signal<'ltr' | 'rtl'>('ltr');

/** Current document direction (reactive). */
export const direction: ReadonlySignal<'ltr' | 'rtl'> = _dir;

/** Whether the document is RTL (reactive). */
export const isRTL: ReadonlySignal<boolean> = computed(() => _dir() === 'rtl');

/** Read current direction from the DOM. */
function detectDirection(): 'ltr' | 'rtl' {
    if (!isBrowser) return 'ltr';
    const dir = document.documentElement.getAttribute('dir') ??
                document.body.getAttribute('dir') ??
                getComputedStyle(document.documentElement).direction;
    return dir === 'rtl' ? 'rtl' : 'ltr';
}

/** Force set direction (e.g. for testing or user override). */
export function setDirection(dir: 'ltr' | 'rtl'): void {
    _dir.set(dir);
    if (isBrowser) document.documentElement.setAttribute('dir', dir);
}

// Auto-detect on load and observe changes
if (isBrowser) {
    _dir.set(detectDirection());

    // Watch for dir attribute changes on <html>
    const observer = new MutationObserver(() => {
        _dir.set(detectDirection());
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['dir'],
    });
}

// ─── Logical property helpers ─────────────────────────────────

/** Returns 'left' or 'right' based on current direction. For inline-start. */
export function inlineStart(): 'left' | 'right' {
    return _dir.peek() === 'rtl' ? 'right' : 'left';
}

/** Returns 'right' or 'left' based on current direction. For inline-end. */
export function inlineEnd(): 'left' | 'right' {
    return _dir.peek() === 'rtl' ? 'left' : 'right';
}

/**
 * Flip a placement (start/end) based on direction.
 * 'top-start' in RTL becomes 'top-end', etc.
 * Used by positioning engine for direction-aware placement.
 */
export function flipPlacement(placement: string): string {
    if (_dir.peek() === 'ltr') return placement;
    return placement
        .replace(/\bstart\b/, '__end__')
        .replace(/\bend\b/, 'start')
        .replace('__end__', 'end');
}

/**
 * Transform a value for RTL context.
 * Useful for: margin-left → margin-right, translateX(10) → translateX(-10).
 */
export function rtlTransformX(value: number): number {
    return _dir.peek() === 'rtl' ? -value : value;
}
