import { describe, it, expect, beforeEach } from 'vitest';
import { context, provide, inject, clearProviders } from '../src/component/context';

describe('provide/inject', () => {
    beforeEach(() => { clearProviders(); });

    it('provides and injects a value', () => {
        const Auth = context<{ user: string }>('auth');
        provide(Auth, { user: 'admin' });
        expect(inject(Auth)).toEqual({ user: 'admin' });
    });

    it('throws when no provider has the token', () => {
        expect(() => inject(context('nonexistent'))).toThrow('No provider for context "nonexistent"');
    });

    it('with a fallback, returns it when no provider has the token', () => {
        expect(inject(context('missing'), undefined, undefined)).toBeUndefined();
    });

    it('with a fallback, returns the provided value when there is one', () => {
        const Router = context<{ path: string }>('router');
        provide(Router, { path: '/' });
        expect(inject(Router, undefined, undefined)).toEqual({ path: '/' });
    });

    it('a token is its own key: another token of the same name finds nothing', () => {
        const Auth = context<{ token: string }>('auth');
        provide(Auth, { token: 'abc' });
        expect(inject(Auth)).toEqual({ token: 'abc' });
        expect(inject(context('auth'), undefined, null)).toBeNull();
    });

    it('overwrites on re-provide', () => {
        const Service = context<string>('service');
        provide(Service, 'v1');
        provide(Service, 'v2');
        expect(inject(Service)).toBe('v2');
    });

    it('clearProviders resets all', () => {
        const A = context<number>('a');
        const B = context<number>('b');
        provide(A, 1);
        provide(B, 2);
        clearProviders();
        expect(inject(A, undefined, undefined)).toBeUndefined();
        expect(inject(B, undefined, undefined)).toBeUndefined();
    });
});

// inject has to cross the shadow boundaries

describe('inject through the Shadow DOM', () => {
    it('finds a provider outside the shadow tree', () => {
        const Svc = context<number>('shadow-svc');
        const outer = document.createElement('div');
        document.body.appendChild(outer);
        provide(Svc, 42, outer);

        const host = document.createElement('div');
        outer.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const inner = document.createElement('span');
        root.appendChild(inner);

        expect(inject(Svc, inner as HTMLElement, undefined)).toBe(42);
    });
});
