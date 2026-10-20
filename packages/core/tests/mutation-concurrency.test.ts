// mutation() concurrency (#500): the policy for a call made while another is pending, the call's own
// AbortSignal, cancel(), enabled(), and the optimistic value kept as one overlay per running call.
// The acceptance cases of docs/language/beta/data.md → «@action», each with calls the test settles
// by hand, so «at once» and «after» are what the test says, not what a timer happens to do.

import { describe, it, expect } from 'vitest';
import { mutation, ActionDisabledError } from '../src/reactivity/mutation';
import { createCache } from '../src/reactivity/cache';

/** A call `fn` received, settled when the test says. */
interface Sent { input: number; signal: AbortSignal; resolve: (v: number) => void; reject: (e: unknown) => void }

/** A `fn` that records every call it receives and leaves it open. */
function recorder() {
    const sent: Sent[] = [];
    const fn = (input: number, { signal }: { signal: AbortSignal }) =>
        new Promise<number>((resolve, reject) => { sent.push({ input, signal, resolve, reject }); });
    return { sent, fn };
}

/** Let the queue's microtasks run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

describe('mutation — concurrency policies', () => {
    it("'queue' (the default) sends two, in order, one at a time", async () => {
        const { sent, fn } = recorder();
        const m = mutation({ fn });
        const a = m.execute(1);
        const b = m.execute(2);
        await flush();
        expect(sent.map((s) => s.input), 'the second waits for the first').toEqual([1]);
        sent[0].resolve(10);
        await a;
        await flush();
        expect(sent.map((s) => s.input)).toEqual([1, 2]);
        sent[1].resolve(20);
        expect(await b).toBe(20);
        expect(m.concurrency).toBe('queue');
    });

    it("'drop' sends one; the second execute() returns the pending call's promise", async () => {
        const { sent, fn } = recorder();
        const m = mutation({ fn, concurrency: 'drop' });
        const a = m.execute(1);
        const b = m.execute(2);
        await flush();
        expect(sent.map((s) => s.input)).toEqual([1]);
        sent[0].resolve(10);
        expect(await a).toBe(10);
        expect(await b, "the dropped call settles with the pending one").toBe(10);
        await flush();
        expect(sent).toHaveLength(1);
    });

    it("'coalesce', given three calls, sends the first and the third; the second settles with the third", async () => {
        const { sent, fn } = recorder();
        const m = mutation({ fn, concurrency: 'coalesce' });
        const a = m.execute(1);
        const b = m.execute(2);
        const c = m.execute(3);
        await flush();
        expect(sent.map((s) => s.input), 'the running call is never replaced').toEqual([1]);
        sent[0].resolve(10);
        await a;
        await flush();
        expect(sent.map((s) => s.input)).toEqual([1, 3]);
        sent[1].resolve(30);
        expect(await c).toBe(30);
        expect(await b).toBe(30);
    });

    it("'parallel' sends two at once; data() is the call that settles last", async () => {
        const { sent, fn } = recorder();
        const m = mutation({ fn, concurrency: 'parallel' });
        const a = m.execute(1);
        const b = m.execute(2);
        expect(sent.map((s) => s.input)).toEqual([1, 2]);
        sent[1].resolve(20);
        await b;
        sent[0].resolve(10);
        await a;
        expect(m.data(), 'the later settlement').toBe(10);
        expect(m.pending()).toBe(false);
    });

    it("a call rejected under 'queue' does not stop the next", async () => {
        const { sent, fn } = recorder();
        const m = mutation({ fn });
        const a = m.execute(1);
        const b = m.execute(2);
        await flush();
        sent[0].reject(new Error('one'));
        await expect(a).rejects.toThrow('one');
        await flush();
        expect(sent.map((s) => s.input)).toEqual([1, 2]);
        sent[1].resolve(20);
        expect(await b).toBe(20);
    });

    it('no policy aborts the running call', async () => {
        for (const concurrency of ['queue', 'drop', 'coalesce', 'parallel'] as const) {
            const { sent, fn } = recorder();
            const m = mutation({ fn, concurrency });
            void m.execute(1);
            void m.execute(2);
            void m.execute(3);
            await flush();
            expect(sent[0].signal.aborted, concurrency).toBe(false);
        }
    });

    it('fn receives the call\'s own signal', async () => {
        const { sent, fn } = recorder();
        const m = mutation({ fn, concurrency: 'parallel' });
        void m.execute(1);
        void m.execute(2);
        expect(sent[0].signal).not.toBe(sent[1].signal);
    });
});

describe('mutation — optimistic values as overlays', () => {
    const appending = () => ({
        key: 'items',
        update: (current: unknown, input: number) => [...(current as number[]), input],
    });

    it('an optimistic value queued behind another call is not visible until its call starts', async () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('items', [0]);
        const { sent, fn } = recorder();
        const m = mutation({ fn, cache, optimistic: appending() });
        const a = m.execute(1);
        void m.execute(2);
        expect(cache.get('items')!.data).toEqual([0, 1]);
        sent[0].resolve(1);
        await a;
        await flush();
        expect(cache.get('items')!.data).toEqual([0, 1, 2]);
    });

    it("under 'parallel', calls 1 and 2 apply their values and call 1 fails: call 2's value stays", async () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('items', [0]);
        const { sent, fn } = recorder();
        const m = mutation({ fn, cache, concurrency: 'parallel', optimistic: appending() });
        const a = m.execute(1);
        const b = m.execute(2);
        expect(cache.get('items')!.data).toEqual([0, 1, 2]);
        sent[0].reject(new Error('one'));
        await expect(a).rejects.toThrow('one');
        expect(cache.get('items')!.data, 'the base with the remaining overlay').toEqual([0, 2]);
        sent[1].resolve(2);
        await b;
        expect(cache.get('items')!.data).toEqual([0, 2]);
    });

    it('control — a single failing call still restores the value it found', async () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('items', [0]);
        const { sent, fn } = recorder();
        const m = mutation({ fn, cache, optimistic: appending() });
        const a = m.execute(1);
        sent[0].reject(new Error('no'));
        await expect(a).rejects.toThrow('no');
        expect(cache.get('items')!.data).toEqual([0]);
    });
});

describe('mutation — cancel() and enabled()', () => {
    it('cancel() with two calls waiting: both reject with AbortError, error() unchanged, the running signal aborted', async () => {
        const { sent, fn } = recorder();
        const m = mutation({ fn });
        const running = m.execute(1);
        const w1 = m.execute(2);
        const w2 = m.execute(3);
        await flush();
        m.cancel();
        await expect(w1).rejects.toMatchObject({ name: 'AbortError' });
        await expect(w2).rejects.toMatchObject({ name: 'AbortError' });
        expect(sent[0].signal.aborted).toBe(true);
        sent[0].reject(sent[0].signal.reason);
        await expect(running).rejects.toMatchObject({ name: 'AbortError' });
        expect(m.error(), 'a cancelled call is not an error').toBeNull();
        expect(m.pending()).toBe(false);
        await flush();
        expect(sent, 'no waiting call ran').toHaveLength(1);
    });

    it('enabled() turning false while a call waits: it does not run, and rejects with ActionDisabledError', async () => {
        let allowed = true;
        const { sent, fn } = recorder();
        const m = mutation({ fn, enabled: () => allowed });
        expect(m.enabled()).toBe(true);
        const a = m.execute(1);
        const b = m.execute(2);
        allowed = false;
        sent[0].resolve(10);
        await a;
        await expect(b).rejects.toBeInstanceOf(ActionDisabledError);
        await flush();
        expect(sent).toHaveLength(1);
        expect(m.error(), 'a disabled call is not an error of the write').toBeNull();
    });
});
