// RTL — direction detection signal + CSS logical property helpers.
// Used by all components to support right-to-left layouts.

import { signal, computed } from '../reactivity/signal';
import type { ReadonlySignal } from '../utils/types';

const isBrowser = typeof document !== 'undefined';

// ─── Direction signal ─────────────────────────────────────────

const _dir = signal<'ltr' | 'rtl'>('ltr');

// The direction is read from the DOM, and `<html dir>` observed, on the first read (#1246): an app that
// never asks runs no getComputedStyle and installs no MutationObserver at load. Read then, it is what a
// detection at load would have found at that moment.
let _started = false;

/** The direction signal, detected and observed from its first read on. */
function dir(): typeof _dir {
    if (_started) return _dir;
    _started = true;
    if (isBrowser) {
        _dir.set(detectDirection());
        new MutationObserver(() => _dir.set(detectDirection())).observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['dir'],
        });
    }
    return _dir;
}

/** Current document direction (reactive). */
export const direction: ReadonlySignal<'ltr' | 'rtl'> = Object.assign(() => dir()(), { peek: () => dir().peek() });

/** Whether the document is RTL (reactive). */
export const isRTL: ReadonlySignal<boolean> = computed(() => dir()() === 'rtl');

/** Read current direction from the DOM. */
function detectDirection(): 'ltr' | 'rtl' {
    if (!isBrowser) return 'ltr';
    const dir = document.documentElement.getAttribute('dir') ??
                document.body.getAttribute('dir') ??
                getComputedStyle(document.documentElement).direction;
    return dir === 'rtl' ? 'rtl' : 'ltr';
}

/** Force set direction (e.g. for testing or user override). */
export function setDirection(value: 'ltr' | 'rtl'): void {
    dir().set(value);
    if (isBrowser) document.documentElement.setAttribute('dir', value);
}

// ─── Logical property helpers ─────────────────────────────────

/** Returns 'left' or 'right' based on current direction. For inline-start. */
export function inlineStart(): 'left' | 'right' {
    return dir().peek() === 'rtl' ? 'right' : 'left';
}

/** Returns 'right' or 'left' based on current direction. For inline-end. */
export function inlineEnd(): 'left' | 'right' {
    return dir().peek() === 'rtl' ? 'left' : 'right';
}

/**
 * Flip a placement (start/end) based on direction.
 * 'top-start' in RTL becomes 'top-end', etc.
 * Used by positioning engine for direction-aware placement.
 */
export function flipPlacement(placement: string): string {
    if (dir().peek() === 'ltr') return placement;
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
    return dir().peek() === 'rtl' ? -value : value;
}
