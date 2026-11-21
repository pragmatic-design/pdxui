/**
 * scenario-port-mount's ratio cancels the order its pages were opened in, and the order its samples
 * mount in (#1277).
 *
 * On Azure runners the page a pair opens first mounted 5–6% slower than the second, in every pair, with
 * the same build on both sides: the spec's control read one build 1.05–1.06× itself, and main went red
 * on it (3cb1804f). The side opened first was always ours — the `.pdx` — so every move was read that
 * much slower than it is. The measure now opens half its pairs in each order, and a couple's ratio is
 * the geometric mean of its two, where a factor that follows the order cancels.
 *
 * Inside a pair, the mount that runs second of a sample paid for the other page's work on the slower
 * CPUs: a/b read 1.09 when `a` ran second and 0.98 when `b` did (Xeon 8573C, EPYC 7763). With an odd
 * number of samples one side ran second once more than the other, and its median landed on a slow one.
 */
import { test, expect } from './fixture';
import { portRatio, SAMPLES, type PairResult } from './port-ratio';

/**
 * Pairs of a component `truth`× its TypeScript version, read with the page opened first `opened`×
 * slower and the mount that runs second of a sample `second`× slower — sample i mounts `b` first when
 * i is even, as the spec does.
 */
function planted(truth: number, opened: number, second: number, count: number, samples = SAMPLES): PairResult[] {
    return Array.from({ length: count }, (_, p) => {
        const oursFirst = p % 2 === 0;
        const a: number[] = [];
        const b: number[] = [];
        for (let i = 0; i < samples; i++) {
            const aSecond = i % 2 === 0;
            a.push(10 * truth * (oursFirst ? opened : 1) * (aSecond ? second : 1));
            b.push(10 * (oursFirst ? 1 : opened) * (aSecond ? 1 : second));
        }
        return { a, b, oursFirst };
    });
}

test('a bias of the page opened first cancels: one build against itself reads 1.00', () => {
    expect(portRatio(planted(1, 1.06, 1, 8))).toBe(1);
});

test('a bias of the mount that runs second cancels: one build against itself reads 1.00', () => {
    expect(portRatio(planted(1, 1, 1.08, 8))).toBe(1);
    expect(portRatio(planted(1, 1.06, 1.08, 8))).toBe(1);
});

test('a component 1.2× its TypeScript version reads 1.2, whatever the order bias', () => {
    expect(portRatio(planted(1.2, 1.06, 1.08, 8))).toBe(1.2);
    expect(portRatio(planted(1.2, 1, 1, 8))).toBe(1.2);
});

test('a pair of an odd number of samples is refused: one side would run second more often', () => {
    expect(() => portRatio(planted(1, 1, 1.08, 8, 21))).toThrow(/turns of two/);
});

test('the pairs must come in both orders, or no bias can cancel', () => {
    const oneOrder = planted(1, 1.06, 1, 8).map((p) => ({ ...p, oursFirst: true }));
    expect(() => portRatio(oneOrder)).toThrow(/both orders/);
});
