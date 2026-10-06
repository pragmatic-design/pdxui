// Reactivity under load — two timed assertions.
//
// They guard something real: a list reconciliation that has gone quadratic, or a batch that stopped
// coalescing, shows up here as a duration and nowhere else. What they cannot do is measure it while
// `pnpm test` compiles six packages in parallel — there the number reads the machine as much as the
// code, and a timed assertion fails inside a full run and passes alone.
//
// So they run alone, through `pnpm test:perf`. The CORRECTNESS half of the batch case lives
// in `final-gaps.test.ts`, where it belongs: that 1000 effects produce exactly 2000 runs is a fact
// about coalescing, not about speed, and it must be checked on every run.

import { describe, it, expect } from 'vitest';
import { signal, effect, batch } from '../../src/reactivity/signal';
import { repeat } from '../../src/renderer/list';

describe('reactivity under load', () => {
    it('reconciles a 10K item list within 500ms', () => {
        const items = signal(Array.from({ length: 10_000 }, (_, i) => ({ id: i, name: `item-${i}` })));

        const frag = repeat(
            () => items(),
            (item) => item.id,
            (item) => {
                const el = document.createElement('div');
                el.textContent = item.name;
                return el;
            },
        );
        document.body.appendChild(frag);

        const start = performance.now();
        items.set(prev => [...prev].reverse());
        const duration = performance.now() - start;

        // A reversal is the worst case for a keyed reconciler: every node moves. 500ms is generous
        // on purpose — what this catches is a return to quadratic behaviour, not a slow afternoon.
        expect(duration).toBeLessThan(500);
        document.body.innerHTML = '';
    });

    it('flushes 1000 effects on one signal within 50ms', () => {
        const s = signal(0);
        let totalRuns = 0;
        const disposes: (() => void)[] = [];
        for (let i = 0; i < 1000; i++) {
            disposes.push(effect(() => { s(); totalRuns++; }));
        }

        const start = performance.now();
        batch(() => { s.set(1); });
        const duration = performance.now() - start;

        expect(totalRuns, 'the batch stopped coalescing — this is not a timing failure').toBe(2000);
        expect(duration).toBeLessThan(50);

        for (const d of disposes) d();
    });
});
