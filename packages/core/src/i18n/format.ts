// i18n Format — locale-aware number, date, and relative time formatting.
// Uses Intl API internally. Reads locale signal for reactivity.
// Caches Intl formatters per locale to avoid re-creation.

import { locale } from './locale';

// ─── Formatter Cache ────────────────────────────────────────────────

const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();
const relativeCache = new Map<string, Intl.RelativeTimeFormat>();

function cacheKey(loc: string, options?: object): string {
    return options ? `${loc}:${JSON.stringify(options)}` : loc;
}

/** Clear all formatter caches (for testing). */
export function clearFormatCache(): void {
    numberCache.clear();
    dateCache.clear();
    relativeCache.clear();
}

// ─── $n() — Number Formatting ──────────────────────────────────────

/**
 * Format a number according to the current locale.
 * Reactive: re-formats when locale changes.
 *
 * @example
 * $n(1234.5)                          // "1,234.5" (en) / "1.234,5" (it)
 * $n(0.75, { style: 'percent' })      // "75%"
 * $n(9.99, { style: 'currency', currency: 'EUR' }) // "9,99 EUR" (it)
 */
export function $n(value: number, options?: Intl.NumberFormatOptions): string {
    const loc = locale();  // reactive read
    const key = cacheKey(loc, options);

    let fmt = numberCache.get(key);
    if (!fmt) {
        fmt = new Intl.NumberFormat(loc, options);
        numberCache.set(key, fmt);
    }

    return fmt.format(value);
}

// ─── $d() — Date Formatting ────────────────────────────────────────

/**
 * Format a date according to the current locale.
 * Reactive: re-formats when locale changes.
 *
 * @example
 * $d(new Date())                      // "3/29/2026" (en) / "29/03/2026" (it)
 * $d('2026-03-29', { dateStyle: 'long' })  // "March 29, 2026" (en)
 */
export function $d(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
    const loc = locale();  // reactive read
    const key = cacheKey(loc, options);

    let fmt = dateCache.get(key);
    if (!fmt) {
        fmt = new Intl.DateTimeFormat(loc, options);
        dateCache.set(key, fmt);
    }

    const date = value instanceof Date ? value : new Date(value);
    return fmt.format(date);
}

// ─── $r() — Relative Time ──────────────────────────────────────────

type RelativeTimeUnit = Intl.RelativeTimeFormatUnit;

/**
 * Format a relative time value according to the current locale.
 * Reactive: re-formats when locale changes.
 *
 * @example
 * $r(-1, 'day')   // "1 day ago" (en) / "1 giorno fa" (it)
 * $r(3, 'hour')   // "in 3 hours" (en) / "tra 3 ore" (it)
 */
export function $r(value: number, unit: RelativeTimeUnit): string {
    const loc = locale();  // reactive read
    const key = `${loc}:rel`;

    let fmt = relativeCache.get(key);
    if (!fmt) {
        fmt = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
        relativeCache.set(key, fmt);
    }

    return fmt.format(value, unit);
}
