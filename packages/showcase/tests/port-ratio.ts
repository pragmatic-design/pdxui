/**
 * The ratio scenario-port-mount.spec.ts reads from its pairs of pages (#1243, #1277): ours over theirs.
 *
 * On Azure runners the page a pair opens first mounted 5–6% slower than the second in every pair, the
 * same build on both sides: the spec's control read one build 1.05–1.06× itself and main went red on it
 * (3cb1804f, 2026-11-21), and since ours was always opened first, every move to .pdx read that much
 * slower than it is. The mechanism was not reproduced off those runners (not on Windows, with the CPU
 * saturated or two bare pages); the order is the one thing left that differs between the two sides of
 * the control. So the measure does not depend on it: its pairs come in couples, one opened in each
 * order, and a couple's ratio is the geometric mean of its two — a factor that follows the order
 * multiplies one and divides the other, and cancels. The tag's ratio is the median of its couples.
 */

/** One pair of fresh pages: the median mount of each side, and which side's page was opened first. */
export interface PairResult { a: number; b: number; oursFirst: boolean }

const median = (xs: number[]): number => {
    const s = [...xs].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The ratio of each couple: a pair opened ours first with one opened theirs first, in their order. */
export function coupleRatios(pairs: readonly PairResult[]): number[] {
    const first = pairs.filter((p) => p.oursFirst);
    const second = pairs.filter((p) => !p.oursFirst);
    if (first.length === 0 || first.length !== second.length) {
        throw new Error(`the pairs must come in both orders, as many of each: ${first.length} ours first, ${second.length} theirs first`);
    }
    return first.map((p, i) => Math.sqrt((p.a / p.b) * (second[i].a / second[i].b)));
}

/** The tag's ratio, to a hundredth: the median of its couples. */
export function portRatio(pairs: readonly PairResult[]): number {
    return Math.round(median(coupleRatios(pairs)) * 100) / 100;
}
