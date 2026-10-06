// One number formatter per chart, in the chart's locale.
//
// Not toLocaleString(), which is the BROWSER's locale, and not '$' + a browser-formatted number:
// with those an English page in an Italian browser shows "24.500" and "10.000". The locale is resolved as pdx-sparkline does
// (resolveLocale: the `locale` prop, then the page's lang, then the browser), and every number the
// chart prints comes from here.

export interface ChartNumbers {
    locale: string;
    /** A plain number: 24500 → "24,500" (en) / "24.500" (de). */
    number(n: number): string;
    /** Compact, for axis ticks: 24500 → "24.5K" (en). */
    compact(n: number): string;
    /** Compact currency, for axis ticks: 24500 → "$24.5K" (en, USD) / "24.500 €" (de, EUR: German has no compact thousands). */
    currency(n: number): string;
    /** A fraction as a percentage: 0.45 → "45%" (en) / "45 %" (de). */
    percent(fraction: number): string;
}

/** `locale` undefined is the runtime's default: the engine used directly, without pdx-chart. */
export function chartNumbers(locale?: string, currency = 'USD'): ChartNumbers {
    const plain = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
    const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 });
    let money: Intl.NumberFormat;
    try {
        // minimumFractionDigits 0: a currency's default (2) clamped to 1 printed "24.500,0 €".
        money = new Intl.NumberFormat(locale, { style: 'currency', currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 });
    } catch (err) {
        // An invalid currency code: the plain compact form rather than a thrown render.
        if (!(err instanceof RangeError)) throw err;
        money = compact;
    }
    const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
    return {
        locale: plain.resolvedOptions().locale,
        number: (n) => plain.format(n),
        compact: (n) => compact.format(n),
        currency: (n) => money.format(n),
        percent: (f) => pct.format(f),
    };
}
