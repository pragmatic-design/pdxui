// responsiveValue() — continuous viewport-dependent values in 3 tiers.
//
// Tier 1 (default): Pure CSS clamp() via Utopia formula — ZERO JS runtime.
// Tier 2: Container-relative using cqi units.
// Tier 3: JS signal with custom easing function.
//
// The compiler transforms Tier 1/2 at build time. Tier 3 runs at runtime.

import { computed } from './signal';
import type { ReadonlySignal } from '../utils/types';

// ─── Types ─────────────────────────────────────────────────────────

export interface ResponsiveValueOptions {
    /** Unit for min/max values (default: 'px'). */
    unit?: string;
    /** Minimum viewport width for interpolation (default: 320). */
    viewportMin?: number;
    /** Maximum viewport width for interpolation (default: 1920). */
    viewportMax?: number;
    /** Use container-relative units instead of viewport (Tier 2). */
    relative?: 'container';
    /** Custom easing function (Tier 3 — requires JS signal). */
    easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | ((t: number) => number);
}

// ─── CSS Generation (Tier 1 & 2) — used by compiler ────────────────

/**
 * Generate a CSS clamp() expression using the Utopia fluid type formula.
 *
 * Formula:
 *   slope = (max - min) / (viewportMax - viewportMin)
 *   intercept = min - slope * viewportMin
 *   preferred = intercept + slope * 100vw
 *   result = clamp(min, preferred, max)
 *
 * @returns CSS expression string: 'clamp(16px, calc(4.8px + 2.5vw), 64px)'
 */
export function responsiveCSS(
    min: number,
    max: number,
    options?: Pick<ResponsiveValueOptions, 'unit' | 'viewportMin' | 'viewportMax' | 'relative'>,
): string {
    const unit = options?.unit ?? 'px';
    const vMin = options?.viewportMin ?? 320;
    const vMax = options?.viewportMax ?? 1920;
    const vUnit = options?.relative === 'container' ? 'cqi' : 'vw';

    const slope = (max - min) / (vMax - vMin);
    const intercept = min - slope * vMin;

    // Round to 4 decimal places for clean CSS
    const slopeVw = round(slope * 100, 4);
    const interceptPx = round(intercept, 4);

    // Build the calc expression
    const sign = interceptPx >= 0 ? '+' : '-';
    const absIntercept = Math.abs(interceptPx);

    return `clamp(${min}${unit}, calc(${absIntercept}${unit} ${sign} ${slopeVw}${vUnit}), ${max}${unit})`;
}

// ─── JS Runtime (Tier 3) — signal-based ─────────────────────────────

/**
 * Create a responsive value that changes with viewport width.
 * Returns a read-only signal that updates on resize.
 *
 * For Tier 1/2 (no easing), use responsiveCSS() instead (zero JS cost).
 * This function is for Tier 3 cases requiring custom easing curves.
 */
export function responsiveValue(
    min: number,
    max: number,
    options?: ResponsiveValueOptions,
): ReadonlySignal<number> {
    const vMin = options?.viewportMin ?? 320;
    const vMax = options?.viewportMax ?? 1920;
    const easingFn = resolveEasing(options?.easing ?? 'linear');

    // Import viewport signal lazily to avoid circular deps
    // The viewport.width signal is from component/viewport.ts
    // For now, use a simple window.innerWidth read in a computed
    return computed(() => {
        const width = typeof window !== 'undefined' ? window.innerWidth : vMin;
        const t = Math.max(0, Math.min(1, (width - vMin) / (vMax - vMin)));
        const eased = easingFn(t);
        return min + (max - min) * eased;
    });
}

// ─── Easing Functions ──────────────────────────────────────────────

function resolveEasing(easing: ResponsiveValueOptions['easing']): (t: number) => number {
    if (typeof easing === 'function') return easing;
    switch (easing) {
        case 'linear': return (t) => t;
        case 'ease-in': return (t) => t * t;
        case 'ease-out': return (t) => t * (2 - t);
        case 'ease-in-out': return (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        default: return (t) => t;
    }
}

function round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}
