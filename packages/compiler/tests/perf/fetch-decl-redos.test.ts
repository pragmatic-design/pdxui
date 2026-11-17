// CodeQL #182 (js/polynomial-redos): parseFetchDecl took the trailing `;` and spaces off a `@fetch`
// type with `/;?\s*$/`. On a type with a long run of whitespace that is not at its end, the engine
// retried the run from each of its positions: time grew with the square of the run (20k tabs 125 ms,
// 40k tabs 778 ms). The type is the author's source, read by the compiler, the dev server and the
// language server on every keystroke.
//
// Measured by growth, not by a fixed time: doubling the run doubles a linear parse and quadruples a
// quadratic one, whatever the machine's speed. The behaviour it must keep is in
// tests/fetch-decl-trailing.test.ts.
import { describe, it, expect } from 'vitest';
import { parseFetchDecl } from '../../src/compiler/script-analyzer-helpers';

/** The fastest of five parses of a `@fetch` whose type holds `n` tabs, in ms. */
function parseTime(n: number): number {
    const line = `@fetch users: 'GET /api/users' as A${'\t'.repeat(n)}B`;
    let best = Infinity;
    for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        parseFetchDecl(line);
        best = Math.min(best, performance.now() - t0);
    }
    return best;
}

describe('a @fetch type with a long run of whitespace inside it', () => {
    it('is read in time linear in its length', () => {
        parseTime(1_000); // warm the parser
        const short = parseTime(20_000);
        const long = parseTime(40_000);
        // Linear: ~2×. Quadratic: ~4×. 3 leaves room for noise on either side.
        expect(long / Math.max(short, 0.05), `20k tabs ${short.toFixed(2)} ms, 40k tabs ${long.toFixed(2)} ms`).toBeLessThan(3);
    });
});
