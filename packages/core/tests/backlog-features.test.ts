// Tests for 5 backlog features: httpResource, @for index, isPending, TC39 compat, W3C Context Protocol.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { signal, computed } from '../src/reactivity/signal';
import { httpResource } from '../src/reactivity/http-resource';
import { toTC39State, toTC39Computed, fromTC39State } from '../src/reactivity/tc39-compat';
import { provide, inject, tryInject, requestContext, clearProviders, installContextProtocol } from '../src/component/context';

// ═══════════════════════════════════════════════════════════════
// httpResource()
// ═══════════════════════════════════════════════════════════════

// These four cases assert the SHAPE of the resource httpResource returns, not what it fetches —
// none of them awaits it. But constructing one starts a request, and with happy-dom's default
// origin of http://localhost:3000 that request would be a real socket, and ECONNREFUSED noise in
// this package's output.
//
// Stubbed rather than left to the guard in tests/setup/no-network.ts. The guard would keep them
// silent and hermetic, but a test whose subject starts a request should say what it expects that
// request to do, instead of relying on a failure nobody asserts.
function stubFetchWithEmptyJson() {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })));
    });
    afterEach(() => { vi.unstubAllGlobals(); });
}

describe('httpResource()', () => {
    stubFetchWithEmptyJson();

    it('creates a resource with GET by default', () => {
        const res = httpResource<string[]>('/api/items');
        expect(res.data).toBeDefined();
        expect(res.loading).toBeDefined();
        expect(res.isPending).toBeDefined();
        expect(res.state).toBeDefined();
        res.dispose();
    });

    it('accepts reactive URL function', () => {
        const id = signal(1);
        const res = httpResource<{ id: number }>(() => `/api/items/${id()}`);
        expect(res.data).toBeDefined();
        res.dispose();
    });

    it('supports POST method', () => {
        const res = httpResource<{ ok: boolean }>('/api/submit', {
            method: 'POST',
            body: { name: 'test' },
        });
        expect(res.data).toBeDefined();
        res.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// isPending() on Resource
// ═══════════════════════════════════════════════════════════════

describe('resource isPending', () => {
    stubFetchWithEmptyJson();

    it('isPending is false during initial load', () => {
        const res = httpResource<string>('/api/data');
        // During initial load: loading=true but isPending=false (no data yet)
        expect(res.isPending()).toBe(false);
        res.dispose();
    });
});

// ═══════════════════════════════════════════════════════════════
// TC39 Signals protocol compatibility
// ═══════════════════════════════════════════════════════════════

describe('TC39 Signals compat', () => {
    it('toTC39State wraps signal with get/set', () => {
        const sig = signal(42);
        const tc39 = toTC39State(sig);

        expect(tc39.get()).toBe(42);
        tc39.set(100);
        expect(tc39.get()).toBe(100);
        expect(sig()).toBe(100); // original signal updated
    });

    it('toTC39Computed wraps computed with get', () => {
        const sig = signal(5);
        const doubled = computed(() => sig() * 2);
        const tc39 = toTC39Computed(doubled);

        expect(tc39.get()).toBe(10);
        sig.set(10);
        expect(tc39.get()).toBe(20);
    });

    it('fromTC39State creates Pragmatic signal from TC39 interface', () => {
        let value = 0;
        const tc39: { get(): number; set(v: number): void } = {
            get: () => value,
            set: (v) => { value = v; },
        };

        const sig = fromTC39State(tc39);
        expect(sig()).toBe(0);

        sig.set(50);
        expect(sig()).toBe(50);
    });
});

// ═══════════════════════════════════════════════════════════════
// W3C Context Protocol
// ═══════════════════════════════════════════════════════════════

describe('W3C Context Protocol', () => {
    it('provide + inject still work (backward compat)', () => {
        provide('test-service', { name: 'TestService' });
        const svc = inject<{ name: string }>('test-service');
        expect(svc.name).toBe('TestService');
        clearProviders();
    });

    it('tryInject returns undefined for missing key', () => {
        clearProviders();
        expect(tryInject('nonexistent')).toBeUndefined();
    });

    it('requestContext dispatches context-request event', () => {
        installContextProtocol();
        provide('w3c-test', { value: 42 });

        const el = document.createElement('div');
        document.body.appendChild(el);

        const result = requestContext<{ value: number }>(el, 'w3c-test');
        expect(result).toBeDefined();
        expect(result!.value).toBe(42);

        el.remove();
        clearProviders();
    });

    it('context-request from non-Pragmatic element works', () => {
        installContextProtocol();
        provide('shared-theme', { dark: true });

        // Simulate a Lit element requesting context
        const litEl = document.createElement('lit-element');
        document.body.appendChild(litEl);

        let received: unknown = null;
        const event = new CustomEvent('context-request', { bubbles: true, composed: true });
        (event as any).context = { name: 'shared-theme' };
        (event as any).callback = (v: unknown) => { received = v; };
        litEl.dispatchEvent(event);

        expect(received).toEqual({ dark: true });
        litEl.remove();
        clearProviders();
    });
});
