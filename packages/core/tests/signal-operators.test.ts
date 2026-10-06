// Tests for all new signal operators — Tier 1, 2, 3.

import { describe, it, expect, vi } from 'vitest';
import { signal, effect, computed } from '../src/reactivity/signal';

// Tier 1: fromEvent, fromObserver, pipe
import { fromEvent, fromEvents } from '../src/reactivity/from-event';
import { fromIntersection, fromResize, fromMutation } from '../src/reactivity/from-observer';
import { pipe, debounce, map, filter, distinct as distinctOp, skip, take } from '../src/reactivity/pipe';

// Tier 2: async operators
import { switchSignal, exhaustSignal, retrySignal, concatSignal } from '../src/reactivity/async-operators';

// Tier 3: utility operators + promise bridge
import { distinct, previous, scan, pairwise, sample, skipUntil, takeUntil } from '../src/reactivity/utility-operators';
import { fromPromise, fromCallback, toPromise, toAsync } from '../src/reactivity/from-promise';

// Shared with dx-improvements.test.ts, which has the same intermittent shape.
import { waitUntil } from './wait-until';


// ═══════════════════════════════════════════════════════════════
// TIER 1: DOM → Signal
// ═══════════════════════════════════════════════════════════════

describe('fromEvent()', () => {
    it('creates signal from DOM event', () => {
        const el = document.createElement('button');
        const clicks = fromEvent(el, 'click');

        // Initial value is undefined (no event yet)
        expect(clicks()).toBeUndefined();

        el.click();
        expect(clicks()).toBeInstanceOf(Event);
        clicks.dispose();
    });

    it('applies transform function', () => {
        const el = document.createElement('input');
        el.type = 'text';
        const values = fromEvent<string>(el, 'input', {
            transform: (e) => (e.target as HTMLInputElement).value,
        });

        el.value = 'hello';
        el.dispatchEvent(new Event('input'));
        expect(values()).toBe('hello');
        values.dispose();
    });

    it('accepts shorthand transform', () => {
        const el = document.createElement('input');
        const values = fromEvent<string>(el, 'input', (e) => (e.target as HTMLInputElement).value);

        el.value = 'test';
        el.dispatchEvent(new Event('input'));
        expect(values()).toBe('test');
        values.dispose();
    });

    it('is reactive — effects track event signal', () => {
        const el = document.createElement('button');
        const clicks = fromEvent(el, 'click');
        let count = 0;

        const dispose = effect(() => { clicks(); count++; });

        el.click();
        expect(count).toBeGreaterThanOrEqual(2); // initial + click

        dispose();
        clicks.dispose();
    });

    it('accepts getter target (lazy ref)', () => {
        const el = document.createElement('div');
        const getEl = () => el;
        const clicks = fromEvent(getEl, 'click');

        el.click();
        expect(clicks()).toBeInstanceOf(Event);
        clicks.dispose();
    });

    it('dispose removes listener', () => {
        const el = document.createElement('button');
        const clicks = fromEvent(el, 'click');
        clicks.dispose();

        el.click();
        expect(clicks()).toBeUndefined();
    });
});

describe('fromEvents()', () => {
    it('listens to multiple events', () => {
        const el = document.createElement('div');
        const interactions = fromEvents(el, ['mousedown', 'mouseup']);
        let count = 0;

        const dispose = effect(() => { interactions(); count++; });

        el.dispatchEvent(new Event('mousedown'));
        el.dispatchEvent(new Event('mouseup'));
        expect(count).toBeGreaterThanOrEqual(3); // initial + 2 events

        dispose();
        interactions.dispose();
    });
});

// Note: Observer tests are limited by happy-dom's API support
describe('fromIntersection()', () => {
    it('returns initial non-intersecting state', () => {
        const el = document.createElement('div');
        const state = fromIntersection(el);
        // happy-dom may not support IntersectionObserver — just verify structure
        const val = state();
        expect(val).toHaveProperty('isIntersecting');
        expect(val).toHaveProperty('ratio');
        state.dispose();
    });
});

describe('fromResize()', () => {
    it('returns initial zero size', () => {
        const el = document.createElement('div');
        const size = fromResize(el);
        const val = size();
        expect(val).toHaveProperty('width');
        expect(val).toHaveProperty('height');
        size.dispose();
    });
});

describe('fromMutation()', () => {
    it('returns initial empty state', () => {
        const el = document.createElement('div');
        const changes = fromMutation(el);
        const val = changes();
        expect(val).toHaveProperty('records');
        expect(val).toHaveProperty('count');
        expect(val.count).toBe(0);
        changes.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// TIER 1: pipe() — composable pipeline
// ═══════════════════════════════════════════════════════════════

describe('pipe()', () => {
    it('passes through with no operators', () => {
        const s = signal(42);
        const result = pipe(() => s());
        expect(result()).toBe(42);
    });

    it('chains map operators', () => {
        const s = signal(5);
        const result = pipe(
            () => s(),
            map(x => x * 2),
            map(x => x + 1),
        );
        expect(result()).toBe(11); // 5*2+1
        result.dispose();
    });

    it('chains filter → keeps last valid value', () => {
        const s = signal(10);
        const result = pipe(
            () => s(),
            filter((x: number) => x > 5),
        );
        expect(result()).toBe(10);

        s.set(3); // filtered out
        expect(result()).toBe(10); // keeps previous

        s.set(20);
        expect(result()).toBe(20);
        result.dispose();
    });

    it('chains debounce + map', async () => {
        const s = signal('');
        const result = pipe(
            () => s(),
            debounce(30),
            map((v: string) => v.toUpperCase()),
        );

        s.set('hello');
        await waitUntil(() => result() === 'HELLO', 'the piped value to arrive uppercased');
        expect(result()).toBe('HELLO');
        result.dispose();
    });

    it('distinct skips duplicate values in pipe', () => {
        const s = signal(1);
        let emitCount = 0;
        const result = pipe(() => s(), distinctOp<number>());

        const dispose = effect(() => { result(); emitCount++; });

        s.set(1); // same value — should skip
        s.set(2); // new value
        expect(result()).toBe(2);

        dispose();
        result.dispose();
    });

    it('skip skips first N changes', () => {
        const s = signal(0);
        const skipped = pipe(() => s(), skip<number>(2));

        expect(skipped()).toBeUndefined(); // no value until skip count reached
        s.set(1); // change #1 — skipped
        expect(skipped()).toBeUndefined();
        s.set(2); // change #2 — skipped
        expect(skipped()).toBeUndefined();
        s.set(3); // change #3 — passes
        expect(skipped()).toBe(3);
        skipped.dispose();
    });

    it('take takes first N changes then freezes', () => {
        const s = signal(0);
        const taken = pipe(() => s(), take<number>(2));

        expect(taken()).toBe(0); // initial value
        s.set(1); // change #1 — taken
        expect(taken()).toBe(1);
        s.set(2); // change #2 — taken
        expect(taken()).toBe(2);
        s.set(3); // change #3 — over limit, frozen
        expect(taken()).toBe(2);
        taken.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// TIER 2: Async operators
// ═══════════════════════════════════════════════════════════════

describe('switchSignal()', () => {
    it('resolves async value', async () => {
        const query = signal('test');
        const results = switchSignal(
            () => query(),
            (q) => Promise.resolve(`results for ${q}`),
        );

        expect(results.loading()).toBe(true);
        await waitUntil(() => results.status() === 'success', 'switchSignal to settle');
        expect(results()).toBe('results for test');
        expect(results.status()).toBe('success');
        results.dispose();
    });

    it('cancels previous request when source changes', async () => {
        let callCount = 0;
        const query = signal('a');
        const results = switchSignal(
            () => query(),
            async (q, sig) => {
                callCount++;
                await new Promise(r => setTimeout(r, 50));
                if (sig.aborted) throw new Error('aborted');
                return `result: ${q}`;
            },
        );

        query.set('b'); // should cancel 'a'
        await waitUntil(() => results() === 'result: b', 'the latest switch to win');

        // Only the latest value should be set
        expect(results()).toBe('result: b');
        results.dispose();
    });

    it('handles errors', async () => {
        const trigger = signal(0);
        const result = switchSignal(
            () => trigger(),
            () => Promise.reject(new Error('fail')),
        );

        await waitUntil(() => result.status() === 'error', 'switchSignal to report the failure');
        expect(result.status()).toBe('error');
        expect(result.error()).toBeInstanceOf(Error);
        result.dispose();
    });
});

describe('exhaustSignal()', () => {
    it('ignores new triggers while busy', async () => {
        let callCount = 0;
        const trigger = signal(0);
        const result = exhaustSignal(
            () => trigger(),
            async () => {
                callCount++;
                await new Promise(r => setTimeout(r, 50));
                return callCount;
            },
        );

        trigger.set(1); // should be ignored (still busy from first)
        trigger.set(2); // should be ignored

        await new Promise(r => setTimeout(r, 100)); // SLEEP-OK: the assertion is that no SECOND call happened; there is no condition to wait for

        // Only 1 call should have executed (the initial one)
        expect(callCount).toBe(1);
        result.dispose();
    });

    it('accepts new trigger after completion', async () => {
        let callCount = 0;
        const trigger = signal(0);
        const result = exhaustSignal(
            () => trigger(),
            async () => {
                callCount++;
                return callCount;
            },
        );

        await new Promise(r => setTimeout(r, 10));
        // First is done, set new trigger
        trigger.set(1);
        await waitUntil(() => callCount === 2, 'exhaustSignal to accept the second call');

        expect(callCount).toBe(2);
        result.dispose();
    });
});

describe('retrySignal()', () => {
    it('retries on failure', async () => {
        let attempts = 0;
        const result = retrySignal(
            async () => {
                attempts++;
                if (attempts < 3) throw new Error('fail');
                return 'success';
            },
            { maxRetries: 3, backoff: 'fixed', delayMs: 10 },
        );

        await waitUntil(() => result.status() === 'success', 'retrySignal to succeed on a later attempt');
        expect(result()).toBe('success');
        expect(result.status()).toBe('success');
        expect(attempts).toBe(3);
        result.dispose();
    });

    it('gives up after maxRetries', async () => {
        const result = retrySignal(
            async () => { throw new Error('always fail'); },
            { maxRetries: 2, backoff: 'fixed', delayMs: 10 },
        );

        // Wait for the RETRIES TO BE EXHAUSTED, not for a stopwatch.
        //
        // A fixed `await new Promise(r => setTimeout(r, 100))` against three attempts with a 10ms
        // fixed backoff is fine on an idle machine, wrong in principle — it fails inside a full
        // `pnpm test`, where six packages share the machine, while passing 48/48 alone. Same shape
        // as `concatSignal` below.
        //
        // The wait is a condition, so a slower machine takes longer instead of failing, and a retry
        // loop that never gives up says exactly that.
        await waitUntil(() => result.status() === 'error', 'retrySignal to exhaust its retries');

        expect(result.status()).toBe('error');
        expect(result.error()).toBeInstanceOf(Error);
        result.dispose();
    });

    it('provides manual retry method', async () => {
        let count = 0;
        const result = retrySignal(
            async () => { count++; return count; },
            { maxRetries: 0 },
        );

        await waitUntil(() => result() === 1, 'the first result');
        expect(result()).toBe(1);

        result.retry();
        await waitUntil(() => result() === 2, 'the manual retry to land');
        expect(result()).toBe(2);
        result.dispose();
    });
});

describe('concatSignal()', () => {
    it('queues operations sequentially', async () => {
        const order: number[] = [];
        const trigger = signal(1);
        const result = concatSignal(
            () => trigger(),
            async (v) => {
                await new Promise(r => setTimeout(r, 20));
                order.push(v);
                return v;
            },
        );

        trigger.set(2);
        trigger.set(3);

        // Wait for the QUEUE TO DRAIN, not for a stopwatch.
        //
        // A fixed `await new Promise(r => setTimeout(r, 150))` against three operations of 20ms
        // each is fine on an idle machine and wrong in principle: under the load of the full
        // `pnpm test` the third operation has not landed when the assertion runs, and the gate goes
        // red about one run in three with `expected [ 1, 2 ] to deeply equal [ 1, 2, 3 ]`.
        // Slowing the work to 60ms, which is what a loaded machine does to it, reproduces it.
        //
        // The assertion below is the exact list, in order. The wait is a condition instead of a
        // duration, so a slower machine takes longer rather than failing, and a genuinely stuck
        // queue fails with a message that says so.
        await waitUntil(() => order.length === 3, 'concatSignal to drain its queue');

        // All should complete in order
        expect(order).toEqual([1, 2, 3]);
        result.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// TIER 3: Utility operators
// ═══════════════════════════════════════════════════════════════

describe('distinct()', () => {
    it('skips duplicate values', () => {
        const s = signal(1);
        const d = distinct(() => s());
        let count = 0;

        const dispose = effect(() => { d(); count++; });

        s.set(1); // same — no re-emit
        const afterSame = count;
        s.set(2); // different — re-emit
        expect(count).toBeGreaterThan(afterSame);
        expect(d()).toBe(2);

        dispose();
        d.dispose();
    });

    it('uses custom equality', () => {
        const s = signal({ id: 1, name: 'a' });
        const d = distinct(() => s(), (a, b) => a.id === b.id);

        s.set({ id: 1, name: 'b' }); // same id — skip
        expect(d().name).toBe('a');

        s.set({ id: 2, name: 'c' }); // different id — emit
        expect(d().name).toBe('c');
        d.dispose();
    });
});

describe('previous()', () => {
    it('tracks the previous value', () => {
        const s = signal(1);
        const prev = previous(() => s());

        expect(prev()).toBeUndefined(); // no previous yet

        s.set(2);
        expect(prev()).toBe(1);

        s.set(3);
        expect(prev()).toBe(2);
        prev.dispose();
    });
});

describe('scan()', () => {
    it('accumulates values', () => {
        const s = signal(1);
        const total = scan(() => s(), (acc, v) => acc + v, 0);

        expect(total()).toBe(1); // initial: 0 + 1

        s.set(5);
        expect(total()).toBe(6); // 1 + 5

        s.set(10);
        expect(total()).toBe(16); // 6 + 10
        total.dispose();
    });

    it('works with non-numeric types', () => {
        const s = signal('a');
        const history = scan(() => s(), (acc, v) => [...acc, v], [] as string[]);

        expect(history()).toEqual(['a']);
        s.set('b');
        expect(history()).toEqual(['a', 'b']);
        history.dispose();
    });
});

describe('pairwise()', () => {
    it('emits previous and current as tuple', () => {
        const s = signal(1);
        const pair = pairwise(() => s());

        expect(pair()).toEqual([1, 1]); // initial: same value

        s.set(2);
        expect(pair()).toEqual([1, 2]);

        s.set(5);
        expect(pair()).toEqual([2, 5]);
        pair.dispose();
    });
});

describe('sample()', () => {
    it('samples source when notifier fires', () => {
        const data = signal('hello');
        const trigger = signal(0);
        const sampled = sample(() => data(), () => trigger());

        expect(sampled()).toBe('hello');

        data.set('world'); // change source but no trigger
        // It IS still 'hello' now: the notifier is tracked, the source is not — the assertion for
        // it is in the describe at the bottom of this file.
        expect(sampled()).toBe('hello');

        trigger.set(1);
        expect(sampled()).toBe('world');
        sampled.dispose();
    });
});

describe('skipUntil()', () => {
    it('ignores values until gate opens', () => {
        const s = signal(1);
        const gate = signal(false);
        const gated = skipUntil(() => s(), () => gate());

        expect(gated()).toBeUndefined(); // gate closed

        s.set(2);
        expect(gated()).toBeUndefined(); // still closed

        gate.set(true);
        s.set(3);
        expect(gated()).toBe(3);
        gated.dispose();
    });
});

describe('takeUntil()', () => {
    it('passes values until stopper fires', () => {
        const s = signal(1);
        const stop = signal(false);
        const limited = takeUntil(() => s(), () => stop());

        expect(limited()).toBe(1);
        s.set(2);
        expect(limited()).toBe(2);

        stop.set(true); // stop
        s.set(3);
        expect(limited()).toBe(2); // frozen
        limited.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// TIER 3: Promise ↔ Signal bridge
// ═══════════════════════════════════════════════════════════════

describe('fromPromise()', () => {
    it('converts resolved promise to signal', async () => {
        const result = fromPromise(Promise.resolve(42));
        expect(result.loading()).toBe(true);

        await waitUntil(() => result.status() === 'success', 'the promise to resolve into the signal');
        expect(result()).toBe(42);
        expect(result.status()).toBe('success');
        expect(result.loading()).toBe(false);
    });

    it('converts rejected promise to error signal', async () => {
        const result = fromPromise(Promise.reject(new Error('oops')));

        await waitUntil(() => result.status() === 'error', 'the rejection to reach the signal');
        expect(result.status()).toBe('error');
        expect(result.error()).toBeInstanceOf(Error);
    });

    it('uses initial value while loading', () => {
        const result = fromPromise(new Promise(() => {}), 'loading...');
        expect(result()).toBe('loading...');
    });
});

describe('fromCallback()', () => {
    it('converts callback API to signal', () => {
        let setter: ((v: number) => void) | null = null;
        const s = fromCallback<number>((set) => { setter = set; });

        expect(s()).toBeUndefined();

        setter!(42);
        expect(s()).toBe(42);

        setter!(100);
        expect(s()).toBe(100);
        s.dispose();
    });

    it('calls cleanup on dispose', () => {
        const cleanup = vi.fn();
        const s = fromCallback<number>((set) => {
            set(1);
            return cleanup;
        });

        s.dispose();
        expect(cleanup).toHaveBeenCalled();
    });
});

describe('toPromise()', () => {
    it('resolves immediately if condition already met', async () => {
        const s = signal(42);
        const result = await toPromise(() => s());
        expect(result).toBe(42);
    });

    it('waits until predicate is satisfied', async () => {
        const s = signal(0);
        const promise = toPromise(() => s(), (v) => v >= 10);

        setTimeout(() => s.set(5), 10);
        setTimeout(() => s.set(10), 20);

        const result = await promise;
        expect(result).toBe(10);
    });

    it('waits for truthy value by default', async () => {
        const s = signal<string | null>(null);
        const promise = toPromise(() => s());

        setTimeout(() => s.set('hello'), 10);

        const result = await promise;
        expect(result).toBe('hello');
    });
});

describe('toAsync()', () => {
    it('yields signal values as async iterable', async () => {
        const s = signal(0);
        const iter = toAsync(() => s());
        const values: number[] = [];

        // Read initial + 2 updates
        const reader = (async () => {
            let count = 0;
            for await (const v of iter) {
                values.push(v);
                count++;
                if (count >= 3) break;
            }
        })();

        // First value is already queued (initial effect run)
        await new Promise(r => setTimeout(r, 10));
        s.set(1);
        await new Promise(r => setTimeout(r, 10));
        s.set(2);

        await reader;
        expect(values).toEqual([0, 1, 2]);
        iter.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// Integration: compose multiple operators
// ═══════════════════════════════════════════════════════════════

describe('composition patterns', () => {
    it('pipe + debounce + distinct + map = search pipeline', async () => {
        const query = signal('');
        const searchTerm = pipe(
            () => query(),
            debounce(30),
            distinctOp<string>(),
            map((q: string) => q.trim().toLowerCase()),
            filter((q: string) => q.length > 2),
        );

        query.set('  He  ');
        await new Promise(r => setTimeout(r, 60)); // SLEEP-OK: asserts the debounce did NOT fire for a 2-char query, so waiting is the point
        expect(searchTerm()).toBeUndefined(); // 'he' is only 2 chars

        query.set('  Hello  ');
        await waitUntil(() => searchTerm() === 'hello', 'the debounced search term');
        expect(searchTerm()).toBe('hello');
        searchTerm.dispose();
    });

    it('fromEvent + pipe = DOM event processing', () => {
        const input = document.createElement('input');
        const values = fromEvent<string>(input, 'input', e => (e.target as HTMLInputElement).value);
        const processed = pipe(
            () => values(),
            map((v: string) => (v ?? '').toUpperCase()),
        );

        input.value = 'test';
        input.dispatchEvent(new Event('input'));
        expect(processed()).toBe('TEST');

        processed.dispose();
        values.dispose();
    });

    it('switchSignal + distinct = deduplicated async', async () => {
        const id = signal(1);
        const data = switchSignal(
            () => id(),
            (v) => Promise.resolve({ id: v, name: `user-${v}` }),
        );

        await waitUntil(() => (data() as { id: number } | undefined)?.id === 1, 'the first user');
        expect(data()).toEqual({ id: 1, name: 'user-1' });

        id.set(2);
        await waitUntil(() => (data() as { id: number } | undefined)?.id === 2, 'the second user');
        expect(data()).toEqual({ id: 2, name: 'user-2' });
        data.dispose();
    });

    it('scan + previous = delta tracking', () => {
        const s = signal(10);
        const prev = previous(() => s());
        const delta = computed(() => {
            const p = prev() ?? s();
            return s() - p;
        });

        s.set(15);
        expect(delta()).toBe(5);

        s.set(12);
        expect(delta()).toBe(-3);
        prev.dispose();
    });
});

// `sample` reads its source OUTSIDE the tracked effect. Read inside it, it would emit whenever the
// source changed — the notifier would not be a gate but a second dependency. That is a mirror of the
// source, not a sample, and it defeats the operator's own documented use: `sample(() => formData(),
// () => submitClicked())` would update on every keystroke.
describe('sample() reads the source without subscribing to it', () => {
    it('a change to the source alone does not move it', () => {
        const data = signal('hello');
        const trigger = signal(0);
        const sampled = sample(() => data(), () => trigger());

        data.set('world');
        expect(sampled(), 'the source moved it with no notification').toBe('hello');

        trigger.set(1);
        expect(sampled(), 'the notifier did not capture the current value').toBe('world');
        sampled.dispose();
    });

    it('captures whatever the source holds at the moment the notifier fires', () => {
        const data = signal(1);
        const trigger = signal(0);
        const sampled = sample(() => data(), () => trigger());

        data.set(2);
        data.set(3);
        trigger.set(1);
        expect(sampled()).toBe(3);

        data.set(4);
        expect(sampled(), 'it kept following the source after the capture').toBe(3);
        sampled.dispose();
    });

    it('still fires on every notification, including one that changes nothing else', () => {
        const data = signal('x');
        const trigger = signal(0);
        const sampled = sample(() => data(), () => trigger());

        trigger.set(1);
        data.set('y');
        trigger.set(2);
        expect(sampled()).toBe('y');
        sampled.dispose();
    });
});
