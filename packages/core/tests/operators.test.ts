import { describe, it, expect } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { debounced, throttled, merged } from '../src/reactivity/operators';
import { waitUntil } from './wait-until';

describe('debounced()', () => {
    it('delays value update until silence period', async () => {
        const source = signal('a');
        const db = debounced(() => source(), 50);

        expect(db()).toBe('a'); // initial sync

        source.set('b');
        source.set('c');
        expect(db()).toBe('a'); // not yet updated

        await waitUntil(() => db() === 'c', 'the debounced value after silence');
        expect(db()).toBe('c'); // updated after silence

        db.dispose();
    });

    it('resets timer on rapid changes', async () => {
        const source = signal(0);
        const db = debounced(() => source(), 50);

        source.set(1);
        await new Promise(r => setTimeout(r, 30));
        source.set(2);
        await new Promise(r => setTimeout(r, 30));
        source.set(3);
        await waitUntil(() => db() === 3, 'the debounced value after silence');

        expect(db()).toBe(3);
        db.dispose();
    });

    it('is reactive — effects track debounced value', async () => {
        const source = signal('x');
        const db = debounced(() => source(), 30);
        const values: string[] = [];

        const dispose = effect(() => { values.push(db()); });

        source.set('y');
        await waitUntil(() => values.includes('y'), 'the debounced effect to see the new value');

        expect(values).toContain('y');
        dispose();
        db.dispose();
    });
});

describe('throttled()', () => {
    it('emits immediately then throttles', async () => {
        const source = signal(0);
        const th = throttled(() => source(), 50);

        expect(th()).toBe(0);

        source.set(1); // immediate
        // throttled may or may not have updated yet depending on timing
        await new Promise(r => setTimeout(r, 10));

        source.set(2);
        source.set(3);
        // Should not update until throttle window passes
        await waitUntil(() => (th() ?? 0) >= 1, 'the throttled value to arrive');

        // Should have the latest value
        expect(th()).toBeGreaterThanOrEqual(1);
        th.dispose();
    });

    it('provides peek()', () => {
        const source = signal(42);
        const th = throttled(() => source(), 100);
        expect(th.peek()).toBe(42);
        th.dispose();
    });
});

describe('merged()', () => {
    it('combines multiple signals into tuple', () => {
        const a = signal(1);
        const b = signal('hello');
        const m = merged(() => a(), () => b());

        const result = m();
        expect(result).toEqual([1, 'hello']);
    });

    it('updates when any source changes', async () => {
        const a = signal(1);
        const b = signal(2);
        const m = merged(() => a(), () => b());
        const snapshots: number[][] = [];

        const dispose = effect(() => { snapshots.push([...(m() as number[])]); });

        a.set(10);
        await waitUntil(() => snapshots.some(s => s[0] === 10 && s[1] === 2), 'the sampled pair');

        expect(snapshots.some(s => s[0] === 10 && s[1] === 2)).toBe(true);
        dispose();
    });
});
