// core's selector: `is(key)` subscribes its reader to its key only, so a change of the source notifies
// the readers of the old key and of the new one — two, not all (#117).

import { describe, it, expect } from 'vitest';
import { selector } from '../src/reactivity/selector';
import { signal, effect, collectDisposers } from '../src/reactivity/signal';

const tick = () => Promise.resolve();

describe('selector', () => {
    it('1,000 keyed readers: a change from a to b re-runs exactly two', async () => {
        const selected = signal<number | null>(1);
        const sel = selector(() => selected());
        const runs = new Array(1000).fill(0);
        const seen: boolean[] = [];
        for (let k = 0; k < 1000; k++) effect(() => { runs[k]++; seen[k] = sel.is(k); });
        expect(seen[1]).toBe(true);
        expect(seen.filter(Boolean)).toHaveLength(1);

        const before = runs.reduce((a, b) => a + b, 0);
        selected.set(500);
        await tick();
        const after = runs.reduce((a, b) => a + b, 0);
        expect(after - before, 'readers re-run by one change').toBe(2);
        expect(seen[1]).toBe(false);
        expect(seen[500]).toBe(true);
    });

    it('a key nobody reads costs nothing, and a reader that goes away stops being counted', async () => {
        const selected = signal('a');
        const sel = selector(() => selected());
        let runs = 0;
        const [, dispose] = collectDisposers(() => effect(() => { runs++; sel.is('b'); }));
        selected.set('b');
        await tick();
        expect(runs).toBe(2);
        dispose();
        selected.set('c');
        await tick();
        expect(runs, 'a disposed reader re-ran').toBe(2);
    });

    it('a change to the same key notifies nobody', async () => {
        const selected = signal(1);
        const sel = selector(() => selected());
        let runs = 0;
        effect(() => { runs++; sel.is(1); });
        selected.set(1);
        await tick();
        expect(runs).toBe(1);
    });

    it('a reader of a key that is neither the old nor the new one is not notified', async () => {
        const selected = signal('a');
        const sel = selector(() => selected());
        let runs = 0;
        effect(() => { runs++; sel.is('x'); });
        selected.set('b');
        await tick();
        expect(runs, 'a reader of another key re-ran').toBe(1);
    });

    it('is() outside an effect reads the current value', async () => {
        const selected = signal(1);
        const sel = selector(() => selected());
        expect(sel.is(1)).toBe(true);
        selected.set(2);
        await tick();
        expect(sel.is(1)).toBe(false);
        expect(sel.is(2)).toBe(true);
    });
});
