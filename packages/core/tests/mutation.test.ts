// Tests for mutation() — execute, state tracking, invalidation, optimistic updates.

import { describe, it, expect, vi } from 'vitest';
import { mutation } from '../src/reactivity/mutation';
import { createCache } from '../src/reactivity/cache';

describe('mutation — basic', () => {
    it('executes the mutation function', async () => {
        const fn = vi.fn().mockResolvedValue({ id: 1, name: 'Alice' });
        const m = mutation({ fn });

        const result = await m.execute({ name: 'Alice' });

        expect(fn).toHaveBeenCalledWith({ name: 'Alice' });
        expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('tracks state: idle → pending → success', async () => {
        let resolve!: (v: unknown) => void;
        const fn = vi.fn(() => new Promise(r => { resolve = r; }));
        const m = mutation({ fn });

        expect(m.state()).toBe('idle');
        expect(m.pending()).toBe(false);

        const promise = m.execute(undefined);
        expect(m.state()).toBe('pending');
        expect(m.pending()).toBe(true);

        resolve({ ok: true });
        await promise;

        expect(m.state()).toBe('success');
        expect(m.pending()).toBe(false);
        expect(m.data()).toEqual({ ok: true });
    });

    it('tracks state: idle → pending → error', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        const m = mutation({ fn });

        await expect(m.execute(undefined)).rejects.toThrow('fail');

        expect(m.state()).toBe('error');
        expect(m.error()).toBeInstanceOf(Error);
        expect((m.error() as Error).message).toBe('fail');
    });

    // A call while another is pending queues (#50). It used to reject with «Mutation already in
    // progress», and a second legitimate write — an autosave and a save, two rows edited — was lost.
    // The double-submit guard is the button's now: `<pdx-button :action>` (#49).
    it('queues a call made while one is pending: in call order, never two at once', async () => {
        let inFlight = 0;
        let maxInFlight = 0;
        const order: number[] = [];
        const m = mutation({
            fn: async (n: number) => {
                inFlight++;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await new Promise(r => setTimeout(r, 5));
                order.push(n);
                inFlight--;
                return n * 10;
            },
        });

        const results = await Promise.all([m.execute(1), m.execute(2), m.execute(3)]);

        expect(results, 'each promise gets its own result').toEqual([10, 20, 30]);
        expect(order).toEqual([1, 2, 3]);
        expect(maxInFlight, 'two calls ran at once').toBe(1);
        expect(m.data(), 'data() is the last call that finished').toBe(30);
    });

    it('a failing call rejects only its own promise, and the next one still runs', async () => {
        const m = mutation({
            fn: async (n: number) => {
                await new Promise(r => setTimeout(r, 1));
                if (n === 2) throw new Error('two');
                return n;
            },
        });

        const [a, b, c] = await Promise.allSettled([m.execute(1), m.execute(2), m.execute(3)]);

        expect(a).toEqual({ status: 'fulfilled', value: 1 });
        expect(b.status).toBe('rejected');
        expect((b as PromiseRejectedResult).reason.message).toBe('two');
        expect(c).toEqual({ status: 'fulfilled', value: 3 });
        expect(m.state(), 'state() is the last call that finished').toBe('success');
    });

    it('pending() stays true while any call is running or queued', async () => {
        const releases: Array<() => void> = [];
        const m = mutation({ fn: () => new Promise<void>(r => { releases.push(() => r()); }) });

        const first = m.execute(undefined);
        const second = m.execute(undefined);
        expect(m.pending()).toBe(true);

        await Promise.resolve();
        releases[0]();
        await first;
        expect(m.pending(), 'the queued call is still to run').toBe(true);

        await new Promise(r => setTimeout(r, 0));
        releases[1]();
        await second;
        expect(m.pending()).toBe(false);
    });

    it('invalidate runs after each successful call', async () => {
        const cache = createCache();
        const invalidate = vi.spyOn(cache, 'invalidate');
        const m = mutation({ fn: async (n: number) => n, invalidate: ['users'], cache });

        await Promise.all([m.execute(1), m.execute(2)]);

        expect(invalidate).toHaveBeenCalledTimes(2);
    });

    it('reset() clears state back to idle', async () => {
        const fn = vi.fn().mockResolvedValue('result');
        const m = mutation({ fn });

        await m.execute(undefined);
        expect(m.state()).toBe('success');

        m.reset();
        expect(m.state()).toBe('idle');
        expect(m.data()).toBeUndefined();
        expect(m.error()).toBeUndefined();
    });
});

describe('mutation — callbacks', () => {
    it('calls onSuccess with data and input', async () => {
        const onSuccess = vi.fn();
        const m = mutation({
            fn: async (input: string) => `Hello ${input}`,
            onSuccess,
        });

        await m.execute('World');

        expect(onSuccess).toHaveBeenCalledWith('Hello World', 'World');
    });

    it('calls onError with error and input', async () => {
        const onError = vi.fn();
        const m = mutation({
            fn: async () => { throw new Error('boom'); },
            onError,
        });

        await expect(m.execute('input')).rejects.toThrow();
        expect(onError).toHaveBeenCalledWith(expect.any(Error), 'input');
    });

    it('calls onSettled on success', async () => {
        const onSettled = vi.fn();
        const m = mutation({
            fn: async () => 'ok',
            onSettled,
        });

        await m.execute('input');
        expect(onSettled).toHaveBeenCalledWith('ok', undefined, 'input');
    });

    it('calls onSettled on error', async () => {
        const onSettled = vi.fn();
        const m = mutation({
            fn: async () => { throw new Error('fail'); },
            onSettled,
        });

        await expect(m.execute('input')).rejects.toThrow();
        expect(onSettled).toHaveBeenCalledWith(undefined, expect.any(Error), 'input');
    });
});

describe('mutation — cache invalidation', () => {
    it('invalidates cache keys on success', async () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('GET:/api/users', [{ id: 1 }]);

        const m = mutation({
            fn: async () => ({ id: 2 }),
            invalidate: 'GET:/api/users',
            cache,
        });

        await m.execute(undefined);
        expect(cache.has('GET:/api/users')).toBe(false);
    });

    it('does NOT invalidate on error', async () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('GET:/api/users', [{ id: 1 }]);

        const m = mutation({
            fn: async () => { throw new Error('fail'); },
            invalidate: 'GET:/api/users',
            cache,
        });

        await expect(m.execute(undefined)).rejects.toThrow();
        expect(cache.has('GET:/api/users')).toBe(true);
    });
});

describe('mutation — optimistic updates', () => {
    it('applies optimistic update before mutation completes', async () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('users', [{ id: 1, name: 'Alice' }]);

        let resolve!: (v: unknown) => void;
        const m = mutation({
            fn: () => new Promise(r => { resolve = r; }),
            optimistic: {
                key: 'users',
                update: (current: unknown, input: unknown) => [
                    ...(current as any[]),
                    input,
                ],
            },
            cache,
        });

        const promise = m.execute({ id: 2, name: 'Bob' });

        // Optimistic: cache should include Bob immediately
        const entry = cache.get('users');
        expect(entry!.data).toEqual([
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
        ]);

        resolve('ok');
        await promise;
    });

    it('rolls back optimistic update on error', async () => {
        const cache = createCache({ gcInterval: 0 });
        cache.set('users', [{ id: 1, name: 'Alice' }]);

        const m = mutation({
            fn: async () => { throw new Error('fail'); },
            optimistic: {
                key: 'users',
                update: (current: unknown, input: unknown) => [
                    ...(current as any[]),
                    input,
                ],
            },
            cache,
        });

        await expect(m.execute({ id: 2, name: 'Bob' })).rejects.toThrow();

        // Should be rolled back to original
        const entry = cache.get('users');
        expect(entry!.data).toEqual([{ id: 1, name: 'Alice' }]);
    });
});
