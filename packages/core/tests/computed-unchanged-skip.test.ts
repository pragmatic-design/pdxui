// An effect does not re-run when the computed it reads kept its value (#115).
//
// A computed without `equals` notified its readers as soon as a source changed, before knowing
// whether its own value had: `parity = computed(() => n() % 2)` and three writes of `n` that keep
// `parity` at 1 ran an effect on `parity` three times, each time to see the same value. Now a
// computed's notification is a «maybe»: before the effect runs, the computeds it read are brought up
// to date and compared, and an effect with nothing changed does not run.

import { describe, it, expect } from 'vitest';
import { signal, computed, effect, batch } from '../src/index';

describe('an effect below a computed whose value does not change', () => {
    it('does not run when the computed recomputes to the same value', () => {
        const n = signal(1);
        const parity = computed(() => n() % 2);
        let runs = 0;
        effect(() => { parity(); runs++; });
        runs = 0;

        n.set(3); n.set(5); n.set(7);

        expect(runs, 'the effect ran for a value that did not change').toBe(0);
    });

    it('runs once per real change', () => {
        const n = signal(1);
        const parity = computed(() => n() % 2);
        const seen: number[] = [];
        effect(() => { seen.push(parity()); });
        seen.length = 0;

        n.set(2); n.set(4); n.set(5);

        expect(seen).toEqual([0, 1]);
    });

    it('through a chain of computeds, the unchanged one stops it', () => {
        const n = signal(1);
        const parity = computed(() => n() % 2);
        const label = computed(() => (parity() ? 'odd' : 'even'));
        let runs = 0;
        effect(() => { label(); runs++; });
        runs = 0;

        n.set(3);
        expect(runs).toBe(0);
        n.set(4);
        expect(runs).toBe(1);
    });

    it('an effect that also reads the written signal still runs', () => {
        const n = signal(1);
        const parity = computed(() => n() % 2);
        const seen: string[] = [];
        effect(() => { seen.push(`${n()}:${parity()}`); });
        seen.length = 0;

        n.set(3);

        expect(seen).toEqual(['3:1']);
    });

    it('in a batch, the same', () => {
        const a = signal(1);
        const b = signal(2);
        const sum = computed(() => a() + b());
        let runs = 0;
        effect(() => { sum(); runs++; });
        runs = 0;

        batch(() => { a.set(2); b.set(1); });

        expect(runs, 'a + b is still 3').toBe(0);
    });

    it('keeps listening after a skipped run', () => {
        const n = signal(1);
        const parity = computed(() => n() % 2);
        const seen: number[] = [];
        effect(() => { seen.push(parity()); });
        seen.length = 0;

        n.set(3);          // skipped
        n.set(4);          // must still be heard

        expect(seen).toEqual([0]);
    });
});
