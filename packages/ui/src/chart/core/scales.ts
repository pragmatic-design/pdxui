// Scales — map data domain to pixel range.
// Linear, category, time. Minimal, zero-dep.

export interface Scale {
    /** Map data value → pixel position. */
    map(value: unknown): number;
    /** Map pixel position → nearest data value. */
    invert(px: number): unknown;
    /** Generate tick values for axis labels. */
    ticks(count?: number): unknown[];
    /** Format a tick value for display. */
    format(value: unknown): string;
}

// ─── Linear Scale ──────────────────────────────────

/** `format` labels the ticks; the chart passes its locale's compact form. */
export function linearScale(domain: [number, number], range: [number, number], format?: (n: number) => string): Scale {
    const [d0, d1] = domain;
    const [r0, r1] = range;
    const dSpan = d1 - d0 || 1;
    const rSpan = r1 - r0;

    return {
        map(value: unknown): number {
            return r0 + ((value as number) - d0) / dSpan * rSpan;
        },
        invert(px: number): unknown {
            return d0 + (px - r0) / rSpan * dSpan;
        },
        ticks(count = 5): unknown[] {
            return niceLinearTicks(d0, d1, count);
        },
        format(value: unknown): string {
            const n = value as number;
            if (format) return format(n);
            if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
            if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'K';
            return n % 1 === 0 ? String(n) : n.toFixed(1);
        },
    };
}

/** The round step (1, 2 or 5 × 10ⁿ) that puts about `count` ticks over [min, max]. */
function niceStepFor(min: number, max: number, count: number): number {
    const rawStep = (max - min) / Math.max(1, count - 1);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / mag;
    if (residual <= 1.5) return 1 * mag;
    if (residual <= 3) return 2 * mag;
    if (residual <= 7) return 5 * mag;
    return 10 * mag;
}

const tidy = (v: number) => Math.round(v * 1e10) / 1e10;

/**
 * [min, max] widened to the round ticks around it (d3's `nice()`), so the end ticks are labelled.
 * A domain that stops at the data plus padding — 0…9555 with a 5000 step — leaves the top tick, 10K,
 * outside it, never drawn. Repeated until the step no longer changes, since
 * a wider domain can call for a larger step.
 */
export function niceDomain(min: number, max: number, count: number): [number, number] {
    if (!(max > min)) return [min, max];
    let lo = min, hi = max;
    for (let i = 0; i < 4; i++) {
        const step = niceStepFor(lo, hi, count);
        const nlo = tidy(Math.floor(min / step) * step), nhi = tidy(Math.ceil(max / step) * step);
        if (nlo === lo && nhi === hi) break;
        lo = nlo; hi = nhi;
    }
    return [lo, hi];
}

/** Generate "nice" tick values that align to round numbers. */
function niceLinearTicks(min: number, max: number, count: number): number[] {
    if (min === max) return [min];
    const niceStep = niceStepFor(min, max, count);

    const niceMin = Math.floor(min / niceStep) * niceStep;
    const niceMax = Math.ceil(max / niceStep) * niceStep;
    const ticks: number[] = [];
    for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
        ticks.push(Math.round(v * 1e10) / 1e10); // avoid float drift
    }
    return ticks;
}

// ─── Category Scale ────────────────────────────────

export function categoryScale(categories: string[], range: [number, number]): Scale {
    const [r0, r1] = range;
    const count = categories.length || 1;
    const step = (r1 - r0) / count;

    return {
        map(value: unknown): number {
            const idx = categories.indexOf(String(value));
            return r0 + (idx >= 0 ? idx : 0) * step + step / 2;
        },
        invert(px: number): unknown {
            const idx = Math.round((px - r0 - step / 2) / step);
            return categories[Math.max(0, Math.min(idx, categories.length - 1))];
        },
        ticks(): unknown[] {
            return categories;
        },
        format(value: unknown): string {
            return String(value ?? '');
        },
    };
}

// ─── Time Scale ────────────────────────────────────

/**
 * `locale`: the chart's (BCP 47), as its numbers are. Undefined is the runtime's: dates printed
 * in it make an English page in an Italian browser read "3 set".
 */
export function timeScale(domain: [Date, Date], range: [number, number], locale?: string): Scale {
    const [d0, d1] = [domain[0].getTime(), domain[1].getTime()];
    const inner = linearScale([d0, d1], range);

    return {
        map(value: unknown): number {
            const t = value instanceof Date ? value.getTime() : new Date(value as string).getTime();
            return inner.map(t);
        },
        invert(px: number): unknown {
            return new Date(inner.invert(px) as number);
        },
        ticks(count = 5): unknown[] {
            const rawTicks = inner.ticks(count) as number[];
            return rawTicks.map(t => new Date(t));
        },
        format(value: unknown): string {
            const d = value instanceof Date ? value : new Date(value as number);
            // Smart format: show time if intraday, date if multi-day
            const span = d1 - d0;
            if (span < 86_400_000) {
                return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            }
            if (span < 86_400_000 * 90) {
                return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
            }
            return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
        },
    };
}

// ─── Auto-domain ───────────────────────────────────

/** Compute [min, max] from numeric values with padding. */
export function numericDomain(values: number[], padFraction = 0.05): [number, number] {
    if (values.length === 0) return [0, 1];
    let min = Infinity, max = -Infinity;
    for (const v of values) {
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (min === max) { min -= 1; max += 1; }
    // Close to 0 anyway: start there. Bars and areas always contain 0 — see seriesYDomain.
    if (min > 0 && min < max * 0.3) min = 0;
    const pad = (max - min) * padFraction;
    return [min === 0 ? 0 : min - pad, max + pad];
}

/**
 * The Y domain of the series on one axis.
 *
 * - A bar encodes a value as a length and an area fills to the baseline, so when either is on the
 *   axis the domain contains 0: min(0, lowest) … max(0, highest). `numericDomain` moved the minimum
 *   to 0 only under 30% of the maximum, and a bar chart of 40…90 started at ≈37.
 * - A stack is measured at every boundary — 0 and each cumulative sum, in the order `drawBars`
 *   stacks — not at its total alone. The totals-only domain of the site's Stacked Bar demo
 *   (8800…12200) started at ≈8600, and Desktop, drawn from 0, was clipped out.
 * - Lines and scatter keep fitting the data.
 */
export function seriesYDomain(
    seriesList: { type?: string; area?: boolean; data: { y: number }[] }[],
    stacked: boolean,
    /** When given, the domain is widened to the round ticks for this many ticks (niceDomain). */
    tickCount?: number,
): [number, number] {
    const values: number[] = [];
    if (stacked) {
        const n = Math.max(0, ...seriesList.map(s => s.data.length));
        for (let i = 0; i < n; i++) {
            let sum = 0;
            values.push(0);
            for (const s of seriesList) {
                sum += s.data[i]?.y ?? 0;
                values.push(sum);
            }
        }
    } else {
        for (const s of seriesList) for (const p of s.data) values.push(p.y);
    }
    const [min, max] = numericDomain(values);
    const fromZero = stacked || seriesList.some(s => s.type === 'bar' || s.area);
    const [lo, hi] = fromZero ? [Math.min(0, min), Math.max(0, max)] : [min, max];
    return tickCount ? niceDomain(lo, hi, tickCount) : [lo, hi];
}
