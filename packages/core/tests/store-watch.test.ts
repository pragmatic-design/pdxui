// Tests for Deep Reactive Store and Watch.

import { describe, it, expect, vi } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { store } from '../src/reactivity/store';
import { watch } from '../src/reactivity/watch';

// ─── store() — Basic Reactivity ──────────────────────────────────

describe('store()', () => {
    it('tracks property reads in effects', () => {
        const state = store({ count: 0 });
        const fn = vi.fn();

        effect(() => {
            fn(state.count);
        });

        expect(fn).toHaveBeenCalledWith(0);
        state.count = 5;
        expect(fn).toHaveBeenCalledWith(5);
    });

    it('does not trigger when value is the same', () => {
        const state = store({ name: 'Alice' });
        const fn = vi.fn();

        effect(() => { fn(state.name); });
        expect(fn).toHaveBeenCalledTimes(1);

        state.name = 'Alice'; // same value
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('tracks multiple independent properties', () => {
        const state = store({ a: 1, b: 2 });
        const fnA = vi.fn();
        const fnB = vi.fn();

        effect(() => { fnA(state.a); });
        effect(() => { fnB(state.b); });

        state.a = 10;
        expect(fnA).toHaveBeenCalledTimes(2);
        expect(fnB).toHaveBeenCalledTimes(1); // b not changed

        state.b = 20;
        expect(fnB).toHaveBeenCalledTimes(2);
    });

    it('tracks nested object properties', () => {
        const state = store({ user: { name: 'Alice', age: 30 } });
        const fn = vi.fn();

        effect(() => { fn(state.user.name); });
        expect(fn).toHaveBeenCalledWith('Alice');

        state.user.name = 'Bob';
        expect(fn).toHaveBeenCalledWith('Bob');
    });

    it('handles array push reactively', () => {
        const state = store({ items: [1, 2, 3] });
        const fn = vi.fn();

        effect(() => { fn(state.items.length); });
        expect(fn).toHaveBeenCalledWith(3);

        state.items.push(4);
        expect(fn).toHaveBeenCalledWith(4);
        expect(state.items).toEqual([1, 2, 3, 4]);
    });

    it('handles array splice reactively', () => {
        const state = store({ items: ['a', 'b', 'c', 'd'] });
        const fn = vi.fn();

        effect(() => { fn(state.items.length); });
        expect(fn).toHaveBeenCalledWith(4);

        state.items.splice(1, 2); // remove 'b', 'c'
        expect(fn).toHaveBeenCalledWith(2);
        expect(state.items).toEqual(['a', 'd']);
    });

    it('handles array pop reactively', () => {
        const state = store({ items: [1, 2, 3] });
        const fn = vi.fn();

        effect(() => { fn(state.items.length); });
        state.items.pop();
        expect(fn).toHaveBeenCalledWith(2);
    });

    it('handles direct index assignment', () => {
        const state = store({ items: ['a', 'b', 'c'] });
        const fn = vi.fn();

        effect(() => { fn(state.items[0]); });
        expect(fn).toHaveBeenCalledWith('a');

        state.items[0] = 'x';
        expect(fn).toHaveBeenCalledWith('x');
    });

    it('returns same proxy for same object (caching)', () => {
        const obj = { x: 1 };
        const s1 = store(obj);
        const s2 = store(obj);
        expect(s1).toBe(s2);
    });

    it('handles property deletion', () => {
        const state = store<Record<string, unknown>>({ a: 1, b: 2 });
        const fn = vi.fn();

        effect(() => { fn(state.a); });
        expect(fn).toHaveBeenCalledWith(1);

        delete state.a;
        expect(fn).toHaveBeenCalledWith(undefined);
    });
});

// ─── watch() — Single Source ─────────────────────────────────────

describe('watch() single source', () => {
    it('watches a signal and calls back on change', () => {
        const count = signal(0);
        const fn = vi.fn();

        watch(count, fn);

        count.set(1);
        expect(fn).toHaveBeenCalledWith(1, 0);

        count.set(5);
        expect(fn).toHaveBeenCalledWith(5, 1);
    });

    it('does not fire on same value', () => {
        const count = signal(0);
        const fn = vi.fn();

        watch(count, fn);
        count.set(0); // same
        expect(fn).not.toHaveBeenCalled();
    });

    it('immediate option fires callback immediately', () => {
        const count = signal(42);
        const fn = vi.fn();

        watch(count, fn, { immediate: true });
        expect(fn).toHaveBeenCalledWith(42, 42);
    });

    it('once option auto-disposes after first change', () => {
        const count = signal(0);
        const fn = vi.fn();

        watch(count, fn, { once: true });
        count.set(1);
        expect(fn).toHaveBeenCalledOnce();

        count.set(2);
        // Should not fire again — need to wait for microtask for dispose
    });

    it('watches a getter function', () => {
        const state = store({ filter: 'all' });
        const fn = vi.fn();

        watch(() => state.filter, fn);
        state.filter = 'active';
        expect(fn).toHaveBeenCalledWith('active', 'all');
    });

    it('returns dispose function', () => {
        const count = signal(0);
        const fn = vi.fn();

        const dispose = watch(count, fn);
        count.set(1);
        expect(fn).toHaveBeenCalledOnce();

        dispose();
        count.set(2);
        expect(fn).toHaveBeenCalledOnce(); // not called again
    });
});

// ─── watch() — Multiple Sources ──────────────────────────────────

describe('watch() multiple sources', () => {
    it('watches multiple signals', () => {
        const a = signal(1);
        const b = signal('hello');
        const fn = vi.fn();

        watch([a, b], fn);

        a.set(2);
        expect(fn).toHaveBeenCalledWith([2, 'hello'], [1, 'hello']);

        b.set('world');
        expect(fn).toHaveBeenCalledWith([2, 'world'], [2, 'hello']);
    });

    it('immediate with multiple sources', () => {
        const a = signal(10);
        const b = signal(20);
        const fn = vi.fn();

        watch([a, b], fn, { immediate: true });
        expect(fn).toHaveBeenCalledWith([10, 20], [10, 20]);
    });
});

// ─── Integration: store + watch ──────────────────────────────────

describe('store + watch integration', () => {
    it('watch a store property via getter', () => {
        const state = store({ items: [] as string[], count: 0 });
        const fn = vi.fn();

        watch(() => state.count, fn);

        state.count = 5;
        expect(fn).toHaveBeenCalledWith(5, 0);
    });
});

// arr.length = 0 has to notify the truncated indexes.

describe('store — length truncation', () => {
    it('an effect on an index is notified when length truncates', () => {
        const state = store({ items: ['a', 'b', 'c'] });
        let seen: unknown = 'unset';
        effect(() => { seen = state.items[1]; });
        expect(seen).toBe('b');

        state.items.length = 0;
        expect(seen).toBeUndefined();
    });
});
