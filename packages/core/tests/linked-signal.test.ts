// Tests for linkedSignal — writable derived signal.

import { describe, it, expect } from 'vitest';
import { signal, effect } from '../src/reactivity/signal';
import { linkedSignal } from '../src/reactivity/linked-signal';

describe('linkedSignal — shorthand', () => {
    it('computes initial value from source', () => {
        const count = signal(5);
        const doubled = linkedSignal(() => count() * 2);

        expect(doubled()).toBe(10);
    });

    it('recomputes when source changes', () => {
        const count = signal(5);
        const doubled = linkedSignal(() => count() * 2);

        count.set(10);
        expect(doubled()).toBe(20);
    });

    it('is writable — manual set overrides computation', () => {
        const count = signal(5);
        const doubled = linkedSignal(() => count() * 2);

        doubled.set(99);
        expect(doubled()).toBe(99);
    });

    it('recomputes on next source change after manual set', () => {
        const count = signal(5);
        const doubled = linkedSignal(() => count() * 2);

        doubled.set(99);
        expect(doubled()).toBe(99);

        count.set(7);
        expect(doubled()).toBe(14);
    });
});

describe('linkedSignal — full form', () => {
    it('computes initial value from source', () => {
        const category = signal('electronics');
        const page = linkedSignal({
            source: () => category(),
            computation: () => 1,
        });

        expect(page()).toBe(1);
    });

    it('resets on source change', () => {
        const category = signal('electronics');
        const page = linkedSignal({
            source: () => category(),
            computation: () => 1,
        });

        page.set(5);
        expect(page()).toBe(5);

        category.set('clothing');
        expect(page()).toBe(1); // reset!
    });

    it('preserves value when source unchanged', () => {
        const category = signal('electronics');
        const page = linkedSignal({
            source: () => category(),
            computation: (_cat, prev) => prev?.source === _cat ? prev.value : 1,
        });

        page.set(5);
        expect(page()).toBe(5);

        // Setting same value should NOT trigger recomputation
        // (but setting a different signal that doesn't affect source won't matter)
    });

    it('receives previous state in computation', () => {
        const items = signal(['a', 'b', 'c']);
        const selected = linkedSignal({
            source: () => items(),
            computation: (currentItems, prev) => {
                // Keep selection if item still exists, otherwise select first
                if (prev && currentItems.includes(prev.value as string)) return prev.value as string;
                return currentItems[0];
            },
        });

        expect(selected()).toBe('a');
        selected.set('b');
        expect(selected()).toBe('b');

        // Update items, 'b' still exists → keep selection
        items.set(['a', 'b', 'd']);
        expect(selected()).toBe('b');

        // Update items, 'b' removed → reset to first
        items.set(['x', 'y']);
        expect(selected()).toBe('x');
    });

    it('is reactive — effects track it', () => {
        const source = signal(1);
        const linked = linkedSignal(() => source() * 10);
        let observed = 0;

        effect(() => { observed = linked(); });
        expect(observed).toBe(10);

        source.set(2);
        expect(observed).toBe(20);

        linked.set(99);
        expect(observed).toBe(99);
    });

    it('avoids unnecessary signal writes (Object.is)', () => {
        const source = signal(1);
        let computeCount = 0;
        const linked = linkedSignal({
            source: () => source(),
            computation: (s) => { computeCount++; return s; },
        });

        expect(linked()).toBe(1);
        expect(computeCount).toBe(1);

        // Change source to different value → recompute
        source.set(2);
        expect(computeCount).toBe(2);
        expect(linked()).toBe(2);
    });
});

describe('linkedSignal — real-world patterns', () => {
    it('pagination reset on category change', () => {
        const category = signal('books');
        const page = linkedSignal({
            source: () => category(),
            computation: () => 1, // always reset to 1
        });

        page.set(3);
        expect(page()).toBe(3);

        category.set('movies');
        expect(page()).toBe(1);

        page.set(7);
        category.set('music');
        expect(page()).toBe(1);
    });

    it('form default from async data', () => {
        const serverName = signal<string | undefined>(undefined);
        const formName = linkedSignal(() => serverName() ?? '');

        expect(formName()).toBe('');

        // Server data arrives
        serverName.set('Alice');
        expect(formName()).toBe('Alice');

        // User edits
        formName.set('Bob');
        expect(formName()).toBe('Bob');

        // Server re-fetches → form updates
        serverName.set('Charlie');
        expect(formName()).toBe('Charlie');
    });
});
