/**
 * Scale formulas — type scale, spacing, radius.
 * Generates CSS values from mathematical ratios.
 */

import type { ScaleRatio } from './types.js';

const RATIOS: Record<ScaleRatio, number> = {
    'minor-third': 1.2,
    'major-third': 1.25,
    'perfect-fourth': 1.333,
    'golden': 1.618,
};

/** Generate modular type scale from base size and ratio */
export function generateTypeScale(base: number, ratio: ScaleRatio): Record<string, string> {
    const r = RATIOS[ratio];
    const rem = (px: number) => `${round(px / 16)}rem`;
    return {
        'xs':   rem(base / (r * r)),
        'sm':   rem(base / r),
        'base': rem(base),
        'lg':   rem(base * r),
        'xl':   rem(base * r * r),
        '2xl':  rem(base * r * r * r),
        '3xl':  rem(base * r * r * r * r),
    };
}

/** Generate spacing scale from base unit and density factor */
export function generateSpacing(baseUnit: number, densityFactor: number): Record<string, string> {
    // Geometric-ish progression: 1, 2, 3, 4, 6, 8, 12, 16 × baseUnit
    const scale: [string, number][] = [
        ['2xs', 1], ['xs', 2], ['sm', 3], ['md', 4],
        ['lg', 6], ['xl', 8], ['2xl', 12], ['3xl', 16],
    ];
    const result: Record<string, string> = {};
    for (const [name, mult] of scale) {
        const px = baseUnit * mult * densityFactor;
        result[name] = `${round(px / 16)}rem`;
    }
    return result;
}

/** Generate radius scale */
export function generateRadius(
    scale: 'sharp' | 'rounded' | 'pill',
    baseUnit: number
): Record<string, string> {
    if (scale === 'sharp') {
        return { sm: '0', md: '0', lg: '0', xl: '0', full: '0' };
    }
    if (scale === 'pill') {
        return { sm: '9999px', md: '9999px', lg: '9999px', xl: '9999px', full: '9999px' };
    }
    return {
        sm:   `${round(baseUnit, 0)}px`,
        md:   `${round(baseUnit * 2, 0)}px`,
        lg:   `${round(baseUnit * 3, 0)}px`,
        xl:   `${round(baseUnit * 4, 0)}px`,
        full: '9999px',
    };
}

/** Generate shadow tokens by intensity */
export function generateShadows(intensity: 'none' | 'subtle' | 'medium' | 'strong'): Record<string, string> {
    if (intensity === 'none') {
        return { sm: 'none', md: 'none', lg: 'none', xl: 'none' };
    }
    // Shadow alpha scales with intensity
    const alpha = { subtle: 0.06, medium: 0.10, strong: 0.15 }[intensity];
    const a = alpha;
    const shadowColor = `light-dark(oklch(0 0 0 / ${a}), oklch(0 0 0 / ${round(a * 3.5)}))`;
    return {
        color: shadowColor,
        sm:  `0 1px 2px ${shadowColor}`,
        md:  `0 4px 6px -1px ${shadowColor}, 0 2px 4px -2px ${shadowColor}`,
        lg:  `0 10px 15px -3px ${shadowColor}, 0 4px 6px -4px ${shadowColor}`,
        xl:  `0 20px 25px -5px ${shadowColor}, 0 8px 10px -6px ${shadowColor}`,
    };
}

/** Density factor from preset name */
export function densityFactor(density: 'compact' | 'normal' | 'comfort'): number {
    return { compact: 0.85, normal: 1, comfort: 1.15 }[density];
}

function round(n: number, d = 4): number {
    if (d === 0) return Math.round(n);
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
}
