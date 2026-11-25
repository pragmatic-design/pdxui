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
 *
 * Inside a pair the same holds for the order of each sample's two mounts: on the slower CPUs (Xeon
 * 8573C, EPYC 7763) the mount that ran second paid for the other page's work, and with 21 samples one
 * side ran second once more than the other, so the median of each side landed on different ground: the
 * control read 1.05–1.06. A pair's ratio is now the median of its turns, a turn being one sample of each
 * order and its ratio their geometric mean. Recomputed on those runs' raw times, the control reads 1.03
 * there and 0.99–1.00 elsewhere: what is left is a difference between the two pages that no order
 * cancels, tracked in #1280.
 */

/**
 * Alternated samples a pair of pages takes: sample i mounts `b` first when i is even, `a` first when
 * odd. Even, so every sample has its turn.
 */
export const SAMPLES = 20;

/** 1,000 and not the 100 of the budget spec: at 100 the 0.1 ms timer is several per cent of a mount. */
export const INSTANCES = 1000;

/**
 * How long a warm mount of INSTANCES tags may take to go still before the tag is measured at fewer
 * (#1387). Each mount waits until its subtree is still, and a tag is mounted 368 times (eight pairs of
 * two pages, three warm-ups and twenty samples each): 1,000 pdx-charts take ~1.8 s to settle, the
 * TypeScript version as long, and the test ran out of its ten minutes before its first pair ended.
 */
export const SETTLE_MS = 250;

/** Never fewer than this: a component slow to settle is not cheap, 100 charts mount in ~11 ms. */
const MIN_INSTANCES = 100;

/**
 * How many tags a sample mounts, from how long a warm mount of INSTANCES took to go still: INSTANCES
 * while that is within SETTLE_MS, else fewer in proportion, by hundreds, never under MIN_INSTANCES.
 * The same number on both sides, so the ratio compares like with like.
 */
export function instancesFor(drawnMs: number): number {
    if (drawnMs <= SETTLE_MS) return INSTANCES;
    const scaled = Math.floor((INSTANCES * SETTLE_MS) / drawnMs / 100) * 100;
    return Math.max(MIN_INSTANCES, scaled);
}

/**
 * One pair of fresh pages: each side's samples in the order they were taken (see SAMPLES), and which
 * side's page was opened first.
 */
export interface PairResult { a: readonly number[]; b: readonly number[]; oursFirst: boolean }

export const median = (xs: readonly number[]): number => {
    const s = [...xs].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * A pair's ratio, ours over theirs: the median of its turns. A turn is samples 2k (`b` first) and 2k+1
 * (`a` first), and its ratio the geometric mean of theirs, where a factor that follows the order the
 * two mounts ran in multiplies one and divides the other.
 */
export function pairRatio(p: PairResult): number {
    if (p.a.length !== p.b.length || p.a.length === 0 || p.a.length % 2) {
        throw new Error(`a pair needs as many samples of each side, in turns of two: ${p.a.length} of a, ${p.b.length} of b`);
    }
    const turns: number[] = [];
    for (let i = 0; i < p.a.length; i += 2) turns.push(Math.sqrt((p.a[i] / p.b[i]) * (p.a[i + 1] / p.b[i + 1])));
    return median(turns);
}

/** The ratio of each couple: a pair opened ours first with one opened theirs first, in their order. */
export function coupleRatios(pairs: readonly PairResult[]): number[] {
    const first = pairs.filter((p) => p.oursFirst);
    const second = pairs.filter((p) => !p.oursFirst);
    if (first.length === 0 || first.length !== second.length) {
        throw new Error(`the pairs must come in both orders, as many of each: ${first.length} ours first, ${second.length} theirs first`);
    }
    return first.map((p, i) => Math.sqrt(pairRatio(p) * pairRatio(second[i])));
}

/** The tag's ratio, to a hundredth: the median of its couples. */
export function portRatio(pairs: readonly PairResult[]): number {
    return Math.round(median(coupleRatios(pairs)) * 100) / 100;
}
