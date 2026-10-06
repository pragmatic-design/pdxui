import { describe, it, expect } from 'vitest';
import { signal, computed, effect, batch, onCleanup } from '../src/reactivity/signal';

describe('signal', () => {
    it('reads initial value via function call', () => {
        const count = signal(0);
        expect(count()).toBe(0);
    });

    it('reads initial value via peek', () => {
        const count = signal(42);
        expect(count.peek()).toBe(42);
    });

    it('updates value via set', () => {
        const count = signal(0);
        count.set(5);
        expect(count()).toBe(5);
    });

    it('updates value via updater function', () => {
        const count = signal(10);
        count.set(v => v + 5);
        expect(count()).toBe(15);
    });

    it('skips update when value is the same (Object.is)', () => {
        const count = signal(0);
        let runs = 0;
        effect(() => { count(); runs++; });
        expect(runs).toBe(1);

        count.set(0); // same value
        expect(runs).toBe(1);
    });

    it('works with non-primitive values', () => {
        const items = signal<string[]>([]);
        items.set(['a', 'b']);
        expect(items()).toEqual(['a', 'b']);
    });
});

/**
 * `{ equals }` — what counts as a change, decided by the caller.
 *
 * `Object.is` is the right default and the wrong answer for a value rebuilt on every write: a
 * parsed query, a DTO from a response, an array mapped from a store. The write is identical in
 * every way a reader cares about and notifies anyway, and on a page where that value round-trips
 * it is a pump with nothing to stop it. Without this option a caller — the router, once per
 * router — has to write the comparison by hand.
 */
describe('signal with a custom equality', () => {
    it('a write the comparison calls equal notifies nobody', () => {
        const query = signal<Record<string, string>>({ status: 'closed' }, { equals: sameMap });
        let runs = 0;
        effect(() => { query(); runs++; });
        expect(runs).toBe(1);

        query.set({ status: 'closed' }); // a new object, the same content
        expect(runs, 'the comparison was asked and its answer was ignored').toBe(1);
        expect(query()).toEqual({ status: 'closed' });
    });

    it('control — a write it calls different still arrives', () => {
        const query = signal<Record<string, string>>({ status: 'closed' }, { equals: sameMap });
        let runs = 0;
        effect(() => { query(); runs++; });

        query.set({ status: 'open' });
        expect(runs, 'a comparison that suppresses everything would pass the row above alone').toBe(2);
        expect(query()).toEqual({ status: 'open' });
    });

    it('a write it calls equal does not happen at all — the OLD object is what is held', () => {
        const held = { status: 'closed' };
        const query = signal<Record<string, string>>(held, { equals: sameMap });
        query.set({ status: 'closed' });

        // The option replaces the identity check, and that check decides whether the write happens,
        // not merely whether anyone hears about it. Same rule as `Object.is`, same as Angular and
        // Solid. It is worth knowing rather than discovering: a reader holding the value by
        // IDENTITY — a Map key, a `prev === next` guard — keeps pointing at the first object.
        expect(query(), 'a write the rule called equal replaced the value anyway').toBe(held);
    });

    it('it decides an updater the same way', () => {
        const items = signal<string[]>(['a'], { equals: (a, b) => a.join() === b.join() });
        let runs = 0;
        effect(() => { items(); runs++; });

        items.set(prev => prev.slice()); // a copy: equal by the rule given
        expect(runs).toBe(1);
        items.set(prev => [...prev, 'b']);
        expect(runs).toBe(2);
    });

    it('setRaw obeys it too — the one that stores a function IS a write', () => {
        const a = (): string => 'x';
        const b = (): string => 'x';
        const handler = signal<() => string>(a, { equals: (p, n) => p.toString() === n.toString() });
        let runs = 0;
        effect(() => { handler(); runs++; });

        handler.setRaw(b); // a different function, the same source
        expect(runs, 'setRaw went around the comparison').toBe(1);
    });

    it('without it, Object.is is still the rule', () => {
        const query = signal<Record<string, string>>({ status: 'closed' });
        let runs = 0;
        effect(() => { query(); runs++; });

        query.set({ status: 'closed' });
        expect(runs, 'the default must not become a deep comparison for everyone').toBe(2);
    });

    it('history keeps it: an entry is pushed only for a real change', () => {
        const name = signal('  John  ', { history: true, equals: (p, n) => p.trim() === n.trim() });
        name.set('John');   // the same name, differently spaced
        name.set('Jane');
        expect(name.history(), 'the stack recorded a write the rule called equal').toEqual(['  John  ', 'Jane']);
        name.undo();
        expect(name()).toBe('  John  ');
    });
});

/** Two flat string maps, compared by content — the shape a query string parses into. */
function sameMap(a: Record<string, string>, b: Record<string, string>): boolean {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => a[k] === b[k]);
}

describe('computed', () => {
    it('derives value from signals', () => {
        const count = signal(3);
        const doubled = computed(() => count() * 2);
        expect(doubled()).toBe(6);
    });

    it('updates when dependency changes', () => {
        const a = signal(1);
        const b = signal(2);
        const sum = computed(() => a() + b());

        expect(sum()).toBe(3);
        a.set(10);
        expect(sum()).toBe(12);
    });

    it('is lazy — does not compute until read', () => {
        const count = signal(0);
        let computeCount = 0;
        const doubled = computed(() => { computeCount++; return count() * 2; });

        // Nothing at creation: computing eagerly here would make a $derived declared before
        // what it reads throw a TDZ error at mount.
        expect(computeCount).toBe(0);

        expect(doubled()).toBe(0); // the first read computes, and collects the deps
        expect(computeCount).toBe(1);

        count.set(1); // marks dirty but doesn't compute yet
        expect(computeCount).toBe(1);

        doubled(); // now it computes
        expect(computeCount).toBe(2);
        expect(doubled()).toBe(2);
        expect(computeCount, 'a clean read recomputed').toBe(2);
    });

    it('peek does not track dependencies', () => {
        const count = signal(5);
        const doubled = computed(() => count() * 2);
        expect(doubled.peek()).toBe(10);
    });
});

describe('effect', () => {
    it('runs immediately', () => {
        let ran = false;
        effect(() => { ran = true; });
        expect(ran).toBe(true);
    });

    it('re-runs when dependency changes', () => {
        const count = signal(0);
        const values: number[] = [];
        effect(() => { values.push(count()); });

        expect(values).toEqual([0]);
        count.set(1);
        expect(values).toEqual([0, 1]);
        count.set(2);
        expect(values).toEqual([0, 1, 2]);
    });

    it('returns a dispose function', () => {
        const count = signal(0);
        let runs = 0;
        const dispose = effect(() => { count(); runs++; });

        expect(runs).toBe(1);
        dispose();

        count.set(1);
        expect(runs).toBe(1); // no re-run after dispose
    });

    it('runs cleanup function on re-execution', () => {
        const count = signal(0);
        let cleanedUp = false;

        effect(() => {
            count();
            return () => { cleanedUp = true; };
        });

        expect(cleanedUp).toBe(false);
        count.set(1);
        expect(cleanedUp).toBe(true);
    });

    it('supports onCleanup registration', () => {
        const count = signal(0);
        let cleanedUp = false;

        effect(() => {
            count();
            onCleanup(() => { cleanedUp = true; });
        });

        expect(cleanedUp).toBe(false);
        count.set(1);
        expect(cleanedUp).toBe(true);
    });
});

describe('batch', () => {
    it('coalesces multiple updates into one effect run', () => {
        const a = signal(0);
        const b = signal(0);
        let runs = 0;

        effect(() => { a(); b(); runs++; });
        expect(runs).toBe(1);

        batch(() => {
            a.set(1);
            b.set(2);
        });

        expect(runs).toBe(2); // only one additional run
        expect(a()).toBe(1);
        expect(b()).toBe(2);
    });

    it('supports nested batches', () => {
        const count = signal(0);
        let runs = 0;

        effect(() => { count(); runs++; });
        expect(runs).toBe(1);

        batch(() => {
            count.set(1);
            batch(() => {
                count.set(2);
            });
            count.set(3);
        });

        // Effects should flush only after outermost batch
        expect(runs).toBe(2);
        expect(count()).toBe(3);
    });
});

// ─── Signal History ────────────────────────────────────────────────

describe('signal with history', () => {
    it('tracks value changes in history()', () => {
        const name = signal('John', { history: true });
        name.set('Jane');
        name.set('Bob');
        expect(name.history()).toEqual(['John', 'Jane', 'Bob']);
    });

    it('reads current value', () => {
        const name = signal('John', { history: true });
        expect(name()).toBe('John');
        name.set('Jane');
        expect(name()).toBe('Jane');
    });

    it('undo restores previous value', () => {
        const name = signal('John', { history: true });
        name.set('Jane');
        name.set('Bob');

        name.undo();
        expect(name()).toBe('Jane');
        name.undo();
        expect(name()).toBe('John');
    });

    it('redo restores undone value', () => {
        const name = signal('John', { history: true });
        name.set('Jane');
        name.undo();
        expect(name()).toBe('John');

        name.redo();
        expect(name()).toBe('Jane');
    });

    it('undo at start does nothing', () => {
        const name = signal('initial', { history: true });
        name.undo();
        expect(name()).toBe('initial');
    });

    it('redo at end does nothing', () => {
        const name = signal('initial', { history: true });
        name.redo();
        expect(name()).toBe('initial');
    });

    it('set after undo truncates redo branch', () => {
        const name = signal('A', { history: true });
        name.set('B');
        name.set('C');
        name.undo();   // → B
        name.set('D'); // truncates C
        expect(name.history()).toEqual(['A', 'B', 'D']);

        name.redo();   // does nothing
        expect(name()).toBe('D');
    });

    it('canUndo is reactive', () => {
        const name = signal('A', { history: true });
        expect(name.canUndo()).toBe(false);

        name.set('B');
        expect(name.canUndo()).toBe(true);

        name.undo();
        expect(name.canUndo()).toBe(false);
    });

    it('canRedo is reactive', () => {
        const name = signal('A', { history: true });
        expect(name.canRedo()).toBe(false);

        name.set('B');
        expect(name.canRedo()).toBe(false);

        name.undo();
        expect(name.canRedo()).toBe(true);

        name.redo();
        expect(name.canRedo()).toBe(false);
    });

    it('skips duplicate values (Object.is)', () => {
        const count = signal(0, { history: true });
        count.set(0); // same value — skipped
        count.set(1);
        count.set(1); // same value — skipped
        expect(count.history()).toEqual([0, 1]);
    });

    it('works with effects — undo triggers re-run', () => {
        const name = signal('A', { history: true });
        const values: string[] = [];
        effect(() => { values.push(name()); });

        name.set('B');
        name.undo();
        expect(values).toEqual(['A', 'B', 'A']);
    });

    it('peek reads without tracking dependencies', () => {
        const name = signal('test', { history: true });
        expect(name.peek()).toBe('test');
    });

    it('updater function works', () => {
        const count = signal(10, { history: true });
        count.set(v => v + 5);
        expect(count()).toBe(15);
        expect(count.history()).toEqual([10, 15]);
    });

    it('canUndo/canRedo work with effects', () => {
        const name = signal('A', { history: true });
        const undoStates: boolean[] = [];
        effect(() => { undoStates.push(name.canUndo()); });

        name.set('B');
        name.undo();

        expect(undoStates).toEqual([false, true, false]);
    });
});
