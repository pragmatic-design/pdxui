import { describe, it, expect, beforeEach } from 'vitest';
import { provide, inject, tryInject, clearProviders } from '../src/component/context';

describe('provide/inject', () => {
    beforeEach(() => { clearProviders(); });

    it('provides and injects a value', () => {
        provide('auth', { user: 'admin' });
        expect(inject<{ user: string }>('auth')).toEqual({ user: 'admin' });
    });

    it('throws when key not found', () => {
        expect(() => inject('nonexistent')).toThrow('No provider found');
    });

    it('tryInject returns undefined when not found', () => {
        expect(tryInject('missing')).toBeUndefined();
    });

    it('tryInject returns value when found', () => {
        provide('router', { path: '/' });
        expect(tryInject<{ path: string }>('router')).toEqual({ path: '/' });
    });

    it('supports symbol keys', () => {
        const AUTH_KEY = Symbol('auth');
        provide(AUTH_KEY, { token: 'abc' });
        expect(inject<{ token: string }>(AUTH_KEY)).toEqual({ token: 'abc' });
    });

    it('overwrites on re-provide', () => {
        provide('service', 'v1');
        provide('service', 'v2');
        expect(inject('service')).toBe('v2');
    });

    it('clearProviders resets all', () => {
        provide('a', 1);
        provide('b', 2);
        clearProviders();
        expect(tryInject('a')).toBeUndefined();
        expect(tryInject('b')).toBeUndefined();
    });
});

// inject has to cross the shadow boundaries

describe('inject through the Shadow DOM', () => {
    it('finds a provider outside the shadow tree', () => {
        const outer = document.createElement('div');
        document.body.appendChild(outer);
        provide('shadow-svc', 42, outer);

        const host = document.createElement('div');
        outer.appendChild(host);
        const root = host.attachShadow({ mode: 'open' });
        const inner = document.createElement('span');
        root.appendChild(inner);

        expect(tryInject('shadow-svc', inner as HTMLElement)).toBe(42);
    });
});
