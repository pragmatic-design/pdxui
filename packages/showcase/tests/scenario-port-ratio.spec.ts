/**
 * scenario-port-mount's ratio cancels the order its pages were opened in (#1277).
 *
 * On Azure runners the page a pair opens first mounted 5–6% slower than the second, in every pair, with
 * the same build on both sides: the spec's control read one build 1.05–1.06× itself, and main went red
 * on it (3cb1804f). The side opened first was always ours — the `.pdx` — so every move was read that
 * much slower than it is. The measure now opens half its pairs in each order, and a couple's ratio is
 * the geometric mean of its two, where a factor that follows the order cancels.
 */
import { test, expect } from './fixture';
import { portRatio, type PairResult } from './port-ratio';

/** Pairs of a component `truth`× its TypeScript version, read with the first page `bias`× slower. */
function planted(truth: number, bias: number, count: number): PairResult[] {
    return Array.from({ length: count }, (_, i) => {
        const oursFirst = i % 2 === 0;
        const a = 10 * truth * (oursFirst ? bias : 1);
        const b = 10 * (oursFirst ? 1 : bias);
        return { a, b, oursFirst };
    });
}

test('a bias of the page opened first cancels: one build against itself reads 1.00', () => {
    expect(portRatio(planted(1, 1.06, 8))).toBe(1);
});

test('a component 1.2× its TypeScript version reads 1.2, whatever the order bias', () => {
    expect(portRatio(planted(1.2, 1.06, 8))).toBe(1.2);
    expect(portRatio(planted(1.2, 1, 8))).toBe(1.2);
});

test('the pairs must come in both orders, or no bias can cancel', () => {
    const oneOrder = planted(1, 1.06, 8).map((p) => ({ ...p, oursFirst: true }));
    expect(() => portRatio(oneOrder)).toThrow(/both orders/);
});
