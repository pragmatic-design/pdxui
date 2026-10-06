// Tests for Composable Lifecycle hooks.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import {
    onMount, onDestroy, onUpdated, onError,
    useEffect,
    getCurrentScope,
} from '../src/component/lifecycle';

let tagId = 100;
function uniqueTag() { return `test-lifecycle-${tagId++}`; }

describe('composable lifecycle', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    // ─── onMount ──────────────────────────────────────────────

    it('onMount fires after component mounts', () => {
        const mounted = vi.fn();
        const tag = uniqueTag();

        component(tag, {
            setup() { onMount(mounted); },
            render: () => html`<div>hello</div>`,
        });

        expect(mounted).not.toHaveBeenCalled();
        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(mounted).toHaveBeenCalledOnce();
    });

    // An async mount callback is what loading data on mount looks like, so the signature accepts
    // it, or the editor would flag every such call. The promise
    // it returns is not a cleanup: nothing is registered for destroy, and nothing awaits it.
    it('onMount takes an async function: it runs, and its promise is not taken for a cleanup', async () => {
        const tag = uniqueTag();
        let loaded = false;
        component(tag, {
            setup() {
                onMount(async () => { await Promise.resolve(); loaded = true; });
            },
            render: () => html`<div>hello</div>`,
        });
        const el = document.createElement(tag);
        document.body.appendChild(el);
        await Promise.resolve(); await Promise.resolve();
        expect(loaded).toBe(true);
        expect(() => el.remove()).not.toThrow();
    });

    it('onMount works in nested composable function', () => {
        const mounted = vi.fn();
        const tag = uniqueTag();

        function useSetup() {
            onMount(mounted);
        }

        component(tag, {
            setup() { useSetup(); },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(mounted).toHaveBeenCalledOnce();
    });

    it('multiple onMount callbacks fire in order', () => {
        const order: number[] = [];
        const tag = uniqueTag();

        component(tag, {
            setup() {
                onMount(() => { order.push(1); });
                onMount(() => { order.push(2); });
                onMount(() => { order.push(3); });
            },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(order).toEqual([1, 2, 3]);
    });

    // ─── onDestroy ────────────────────────────────────────────

    it('onDestroy fires when component disconnects', () => {
        const destroyed = vi.fn();
        const tag = uniqueTag();

        component(tag, {
            setup() { onDestroy(destroyed); },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(destroyed).not.toHaveBeenCalled();

        document.body.removeChild(el);
        expect(destroyed).toHaveBeenCalledOnce();
    });

    it('onDestroy works in composable', () => {
        const destroyed = vi.fn();
        const tag = uniqueTag();

        function useCleanup() {
            onDestroy(destroyed);
        }

        component(tag, {
            setup() { useCleanup(); },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        document.body.removeChild(el);
        expect(destroyed).toHaveBeenCalledOnce();
    });

    // ─── useEffect ────────────────────────────────────────────

    it('useEffect tracks reactive dependencies', () => {
        const effectFn = vi.fn();
        const tag = uniqueTag();
        const count = signal(0);

        component(tag, {
            setup() {
                useEffect(() => {
                    count();
                    effectFn();
                });
            },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(effectFn).toHaveBeenCalledOnce();

        count.set(1);
        expect(effectFn).toHaveBeenCalledTimes(2);
    });

    it('useEffect disposes on component disconnect', () => {
        const effectFn = vi.fn();
        const tag = uniqueTag();
        const count = signal(0);

        component(tag, {
            setup() {
                useEffect(() => {
                    count();
                    effectFn();
                });
            },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(effectFn).toHaveBeenCalledOnce();

        document.body.removeChild(el);
        count.set(5);
        // Effect should NOT fire after disconnect
        expect(effectFn).toHaveBeenCalledOnce();
    });

    // ─── Composable pattern ───────────────────────────────────

    it('full composable pattern with mount + destroy + effect', () => {
        const log: string[] = [];
        const tag = uniqueTag();

        function useCounter(initial: number) {
            const count = signal(initial);
            onMount(() => { log.push('counter:mount'); });
            onDestroy(() => log.push('counter:destroy'));
            useEffect(() => {
                log.push(`counter:effect:${count()}`);
            });
            return { count, inc: () => count.set(v => v + 1) };
        }

        let counterApi: ReturnType<typeof useCounter>;

        component(tag, {
            setup() {
                counterApi = useCounter(0);
                return counterApi;
            },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);

        expect(log).toEqual(['counter:effect:0', 'counter:mount']);

        counterApi!.inc();
        expect(log).toContain('counter:effect:1');

        document.body.removeChild(el);
        expect(log).toContain('counter:destroy');
    });

    // ─── Scope isolation ──────────────────────────────────────

    it('scope is null outside setup()', () => {
        expect(getCurrentScope()).toBeNull();
    });

    it('throws when onMount called outside setup', () => {
        expect(() => onMount(() => {})).toThrow('outside component setup');
    });

    it('throws when onDestroy called outside setup', () => {
        expect(() => onDestroy(() => {})).toThrow('outside component setup');
    });

    it('throws when useEffect called outside setup', () => {
        expect(() => useEffect(() => {})).toThrow('outside component setup');
    });

    it('throws when onUpdated called outside setup', () => {
        expect(() => onUpdated(() => {})).toThrow('outside component setup');
    });

    it('scope is active during setup, null after', () => {
        let scopeDuringSetup: unknown = null;
        let scopeAfterSetup: unknown = 'not-checked';
        const tag = uniqueTag();

        component(tag, {
            setup() {
                scopeDuringSetup = getCurrentScope();
            },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        scopeAfterSetup = getCurrentScope();

        expect(scopeDuringSetup).not.toBeNull();
        expect(scopeAfterSetup).toBeNull();
    });

    // ─── Nested composables ───────────────────────────────────

    it('deeply nested composables share the same scope', () => {
        const log: string[] = [];
        const tag = uniqueTag();

        function useInner() {
            onMount(() => { log.push('inner:mount'); });
            onDestroy(() => log.push('inner:destroy'));
        }

        function useOuter() {
            onMount(() => { log.push('outer:mount'); });
            onDestroy(() => log.push('outer:destroy'));
            useInner();
        }

        component(tag, {
            setup() { useOuter(); },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(log).toEqual(['outer:mount', 'inner:mount']);

        document.body.removeChild(el);
        expect(log).toContain('inner:destroy');
        expect(log).toContain('outer:destroy');
    });

    // ─── onError ──────────────────────────────────────────────

    it('onError registers error handler', () => {
        const errorHandler = vi.fn();
        const tag = uniqueTag();

        component(tag, {
            setup() {
                onError(errorHandler);
            },
            render: () => html`<div>hello</div>`,
        });

        const el = document.createElement(tag) as any;
        document.body.appendChild(el);

        // Verify the error callback was registered
        expect(el._errorCallbacks).toHaveLength(1);
    });
});
