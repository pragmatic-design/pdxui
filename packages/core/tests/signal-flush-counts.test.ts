// How many times effects run for one handler call, per flush strategy (#48).
//
// The cases are `bench/signal-flush-cases.ts`; `pnpm --filter @pdxui/core run bench` times them.
// The times vary with the machine and are printed there; the counts do not, and are held here, in
// the gate. They are the fact a flush decision rests on: under the synchronous flush an effect runs
// once per write and the runs before the last see a state half written; inside `batch()` it runs
// once. When #114 (handlers compiled into `batch()`) or #115 (no re-run below an unchanged computed)
// lands, the row it changes is updated here, in the same pull request.

import { describe, it, expect } from 'vitest';
import { signal, effect, batch } from '../src/index';
import { CASES, STRATEGIES, type Strategy } from '../bench/signal-flush-cases';

/** Effect runs after one `run()`, per case and strategy. */
const EXPECTED: Record<string, Record<Strategy, number>> = {
    '(a) 1 signal, 1 effect': { sync: 1, batched: 1 },
    '(a) 3 signals, 1 effect': { sync: 3, batched: 1 },
    '(a) 10 signals, 1 effect': { sync: 10, batched: 1 },
    '(b) 3 signals, 100 effects': { sync: 300, batched: 100 },
    // Every row reads `selected`, so all 1000 run once for it, and the relabelled row runs again.
    // Batched too: a row's item is set by the LIST's effect, which runs after the rows' own in the
    // same flush, so the relabelled row first runs with the new selection and its old label, then
    // again. One torn run that `batch()` does not remove (measured, not predicted: 1000 was).
    '(c) @for of 1000 rows, select + relabel': { sync: 1001, batched: 1001 },
    '(d) 3 signals, computed chain 10 deep': { sync: 3, batched: 1 },
    // Today the effect re-runs although the computed it reads kept its value; #115 brings both to 0.
    '(e) 3 writes, computed value unchanged': { sync: 3, batched: 1 },
    // Compiled handlers are batched by the compiler (#114): one run under either strategy. Without
    // the compiler's batch the sync column reads 3, one per write the effect reads (measured).
    '(f) a compiled template handler, 3 signals': { sync: 1, batched: 1 },
};

describe('effect runs per handler call, by flush strategy', () => {
    it('every case has an expected count, and every expected count a case', () => {
        expect(Object.keys(EXPECTED).sort()).toEqual(CASES.map(c => c.name).sort());
    });

    for (const c of CASES) {
        for (const strategy of STRATEGIES) {
            it(`${c.name} — ${strategy}`, () => {
                const built = c.build(strategy);
                built.run();
                expect(built.effectRuns()).toBe(EXPECTED[c.name][strategy]);
            });
        }
    }

    it('control — the synchronous flush shows a half-written state, and batch() does not', () => {
        // The torn read the issue measured on the published package: an effect reading a and b sees
        // `1,0` first when they are written one after the other outside batch().
        const a = signal(0), b = signal(0);
        const seen: string[] = [];
        effect(() => { seen.push(`${a()},${b()}`); });
        a.set(1); b.set(1);
        batch(() => { a.set(2); b.set(2); });
        expect(seen).toEqual(['0,0', '1,0', '1,1', '2,2']);
    });
});
