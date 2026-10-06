// The locale of a component that formats or parses numbers and dates.
//
// An empty `locale` prop means one thing in every component — not no Intl at all (a number input
// would read «2,5» as 25 in an Italian page), nor a per-component fallback — resolved in this order:
//   1. the component's `locale` prop, when set;
//   2. the `lang` of the nearest ancestor that declares one — the platform's own statement of the
//      content language, so a lang="it" page gets Italian calendars with no attribute on each field;
//   3. navigator.language;
//   4. 'en'.
// It is read when a component formats or parses, so a new prop value applies at once. A `lang`
// changed on <html> after mount is NOT tracked: the component re-reads it only when something else
// makes it format again.

/** A tag Intl accepts, or '' — an invalid `lang` is skipped rather than thrown from a formatter. */
function usable(tag: string | null | undefined): string {
    if (!tag) return '';
    try {
        return Intl.getCanonicalLocales(tag)[0] ?? '';
    } catch (err) {
        if (err instanceof RangeError) return '';
        throw err;
    }
}

/** The locale `el` formats and parses in: `prop`, else the nearest `lang`, else the browser, else 'en'. */
export function resolveLocale(el: Element, prop?: string): string {
    const own = usable(prop);
    if (own) return prop!;
    const lang = usable(el.closest('[lang]:not([lang=""])')?.getAttribute('lang'));
    if (lang) return lang;
    const browser = typeof navigator !== 'undefined' ? usable(navigator.language) : '';
    return browser || 'en';
}

/**
 * The decimal and grouping separators of `locale`, read from Intl rather than from a list of
 * languages: the number input used to know five ("de", "it", "fr", "es", "pt") and read a comma as
 * a thousands separator everywhere else.
 */
export function numberSeparators(locale: string): { decimal: string; group: string } {
    const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
    return {
        decimal: parts.find(p => p.type === 'decimal')?.value ?? '.',
        group: parts.find(p => p.type === 'group')?.value ?? '',
    };
}
