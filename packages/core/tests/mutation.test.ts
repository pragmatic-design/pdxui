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

    it('prevents double-submit while pending', async () => {
        let resolve!: (v: unknown) => void;
        const fn = vi.fn(() => new Promise(r => { resolve = r; }));
        const m = mutation({ fn });

        m.execute(undefined);
        await expect(m.execute(undefined)).rejects.toThrow('Mutation already in progress');

        resolve('ok');
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
