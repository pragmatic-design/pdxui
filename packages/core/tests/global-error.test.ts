import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onGlobalError, dispatchGlobalError, safeHandler, clearGlobalErrorHandlers } from '../src/component/global-error';
import { signal, effect } from '../src/reactivity/signal';
import { waitUntil } from './wait-until';

describe('Global Error Interceptor', () => {
    beforeEach(() => clearGlobalErrorHandlers());
    afterEach(() => clearGlobalErrorHandlers());

    describe('onGlobalError', () => {
        it('registers handler and receives dispatched errors', () => {
            const handler = vi.fn();
            onGlobalError(handler);

            dispatchGlobalError(new Error('test'), { source: 'render' });

            expect(handler).toHaveBeenCalledOnce();
            expect(handler.mock.calls[0][0].message).toBe('test');
            expect(handler.mock.calls[0][1]).toEqual({ source: 'render' });
        });

        it('returns dispose function', () => {
            const handler = vi.fn();
            const dispose = onGlobalError(handler);

            dispose();
            dispatchGlobalError(new Error('test'), { source: 'render' });

            expect(handler).not.toHaveBeenCalled();
        });

        it('supports multiple handlers', () => {
            const h1 = vi.fn();
            const h2 = vi.fn();
            onGlobalError(h1);
            onGlobalError(h2);

            dispatchGlobalError(new Error('test'), { source: 'effect' });

            expect(h1).toHaveBeenCalledOnce();
            expect(h2).toHaveBeenCalledOnce();
        });

        it('suppresses console.error when handler returns true', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            onGlobalError(() => true);

            dispatchGlobalError(new Error('suppressed'), { source: 'render' });

            // Should not have the default "[pdx] Unhandled" message
            const calls = spy.mock.calls.filter(c => String(c[0]).includes('[pdx] Unhandled'));
            expect(calls.length).toBe(0);
            spy.mockRestore();
        });

        it('logs to console when no handler suppresses', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            onGlobalError(() => {}); // returns undefined, not true

            dispatchGlobalError(new Error('logged'), { source: 'event', component: 'pdx-button' });

            expect(spy).toHaveBeenCalledWith(
                expect.stringContaining('Unhandled event error in <pdx-button>'),
                expect.any(Error),
            );
            spy.mockRestore();
        });

        it('includes component and event in context', () => {
            const handler = vi.fn();
            onGlobalError(handler);

            dispatchGlobalError(new Error('click boom'), {
                source: 'event',
                component: 'pdx-counter',
                event: 'click',
            });

            expect(handler.mock.calls[0][1]).toEqual({
                source: 'event',
                component: 'pdx-counter',
                event: 'click',
            });
        });
    });

    describe('safeHandler', () => {
        it('wraps sync function and dispatches on throw', () => {
            const handler = vi.fn();
            onGlobalError(handler);

            const wrapped = safeHandler(() => { throw new Error('sync boom'); }, 'pdx-btn', 'click');
            wrapped();

            expect(handler).toHaveBeenCalledOnce();
            expect(handler.mock.calls[0][0].message).toBe('sync boom');
            expect(handler.mock.calls[0][1]).toEqual({ source: 'event', component: 'pdx-btn', event: 'click' });
        });

        it('wraps async function and dispatches on rejection', async () => {
            const handler = vi.fn();
            onGlobalError(handler);

            const wrapped = safeHandler(async () => { throw new Error('async boom'); }, 'pdx-form', 'submit');
            wrapped();

            // Wait for microtask (promise rejection)
            await waitUntil(() => handler.mock.calls.length > 0, 'the unhandled rejection to reach the handler');

            expect(handler).toHaveBeenCalledOnce();
            expect(handler.mock.calls[0][0].message).toBe('async boom');
        });

        it('passes through return value on success', () => {
            const wrapped = safeHandler(() => 42, 'pdx-calc', 'click');
            expect(wrapped()).toBe(42);
        });

        it('passes arguments through', () => {
            const fn = vi.fn((a: number, b: number) => a + b);
            const wrapped = safeHandler(fn, 'pdx-math', 'click');

            expect(wrapped(3, 4)).toBe(7);
            expect(fn).toHaveBeenCalledWith(3, 4);
        });
    });

    describe('effect error integration', () => {
        it('dispatches effect errors to global handler when no local boundary', () => {
            const handler = vi.fn();
            onGlobalError(handler);
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const s = signal(0);
            let count = 0;
            effect(() => {
                s(); // track
                count++;
                if (count > 1) throw new Error('effect boom');
            });

            // Trigger the effect
            s.set(1);

            expect(handler).toHaveBeenCalledOnce();
            expect(handler.mock.calls[0][0].message).toBe('effect boom');
            expect(handler.mock.calls[0][1].source).toBe('effect');
            spy.mockRestore();
        });
    });

    describe('dispatchGlobalError', () => {
        it('converts non-Error to Error', () => {
            const handler = vi.fn();
            onGlobalError(handler);

            dispatchGlobalError('string error', { source: 'unhandled' });

            expect(handler.mock.calls[0][0]).toBeInstanceOf(Error);
            expect(handler.mock.calls[0][0].message).toBe('string error');
        });

        it('survives handler that throws', () => {
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            onGlobalError(() => { throw new Error('handler crash'); });

            // Should not throw
            expect(() => dispatchGlobalError(new Error('test'), { source: 'render' })).not.toThrow();
            spy.mockRestore();
        });
    });
});
