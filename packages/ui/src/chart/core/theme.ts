// Chart theme — reads design tokens from CSS custom properties.
// Automatically adapts to pdx-theme and pdx-scheme changes.

import type { ChartTheme } from './types';

/** Default fallback palette (used when CSS vars unavailable). */
const FALLBACK_PALETTE = [
    '#5470c6', '#91cc75', '#fac858', '#ee6666',
    '#73c0de', '#3ba272', '#fc8452', '#9a60b4',
    '#ea7ccc', '#48b8d0',
];

/** Read a CSS custom property value, with fallback. */
function readVar(el: Element, name: string, fallback: string): string {
    return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

/** Resolve a CSS color to a canvas-compatible rgb/hex string.
 *  Handles oklch(), light-dark(), var() etc. by letting the browser resolve it. */
function resolveColor(el: Element, cssColor: string): string {
    if (!cssColor || cssColor === 'undefined') return '';
    // Already a simple color
    if (cssColor.startsWith('#') || cssColor.startsWith('rgb')) return cssColor;

    // Use a temp element to force browser resolution
    const tmp = document.createElement('div');
    tmp.style.color = cssColor;
    (el as HTMLElement).appendChild(tmp);
    const resolved = getComputedStyle(tmp).color;
    tmp.remove();
    return resolved || cssColor;
}

/** Read a CSS custom property and resolve to canvas-compatible color. */
function readColor(el: Element, name: string, fallback: string): string {
    const raw = readVar(el, name, '');
    if (!raw) return fallback;
    return resolveColor(el, raw) || fallback;
}

/** Build chart theme from the nearest styled element's CSS tokens. */
export function resolveTheme(el: Element): ChartTheme {
    const palette: string[] = [];

    // Read semantic colors (resolved to canvas-compatible rgb)
    const primary = readColor(el, '--pdx-color-primary', '');
    const success = readColor(el, '--pdx-color-success', '');
    const warning = readColor(el, '--pdx-color-warning', '');
    const danger = readColor(el, '--pdx-color-danger', '');
    const info = readColor(el, '--pdx-color-info', '');

    if (primary) {
        palette.push(primary);
        if (info) palette.push(info);
        if (success) palette.push(success);
        if (warning) palette.push(warning);
        if (danger) palette.push(danger);

        // Extend with tinted variants
        const p300 = readColor(el, '--pdx-primary-300', '');
        const p500 = readColor(el, '--pdx-primary-500', '');
        if (p300) palette.push(p300);
        if (p500) palette.push(p500);
    }

    const finalPalette = palette.length >= 3 ? palette : FALLBACK_PALETTE;

    return {
        palette: finalPalette,
        textColor: readColor(el, '--pdx-color-text', '#333'),
        mutedColor: readColor(el, '--pdx-color-muted', '#999'),
        gridColor: readColor(el, '--pdx-color-border', '#e0e0e0'),
        bgColor: readColor(el, '--pdx-color-surface', '#fff'),
        insetColor: readColor(el, '--pdx-color-inset', ''),
        fontFamily: readVar(el, '--pdx-font-sans', 'system-ui, sans-serif'),
        fontSize: parseFloat(readVar(el, '--pdx-text-sm', '13')) || 13,
    };
}
