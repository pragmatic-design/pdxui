// Tests for hierarchical provide/inject by token (#495): the nearest provider of a token wins, the
// current component's element is where a setup injects from, and a provided signal is writable by
// whoever injects it.

import { describe, it, expect, beforeEach } from 'vitest';
import { context, provide, inject, clearProviders } from '../src/component/context';
import { signal } from '../src/reactivity/signal';
import { pushScope, popScope, getCurrentScope } from '../src/component/lifecycle';
import type { ComponentScope } from '../src/component/lifecycle';
import type { Signal } from '../src/utils/types';

beforeEach(() => {
    clearProviders();
    document.body.innerHTML = '';
});

function makeFakeScope(el: HTMLElement): ComponentScope {
    return {
        track: () => () => {},
        registerMount: () => {},
        registerDestroy: () => {},
        registerUpdated: () => {},
        registerError: () => {},
        registerShow: () => {},
        registerHide: () => {},
        registerPropsChange: () => {},
        registerBeforeLeave: () => {},
        registerRouteChange: () => {},
        element: el,
    };
}

describe('hierarchical provide/inject', () => {
    it('provides on parent, injects from child', () => {
        const Key = context<string>('key');
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);
        provide(Key, 'value', parent);
        expect(inject(Key, child)).toBe('value');
    });

    it('nearest ancestor wins (scoped override)', () => {
        const Theme = context<string>('theme');
        const grandparent = document.createElement('div');
        const parent = document.createElement('div');
        const child = document.createElement('div');
        grandparent.appendChild(parent);
        parent.appendChild(child);
        document.body.appendChild(grandparent);

        provide(Theme, 'light', grandparent);
        provide(Theme, 'dark', parent);

        expect(inject(Theme, child)).toBe('dark');
    });

    it('falls back to global registry', () => {
        const Global = context<string>('globalKey');
        provide(Global, 'globalVal');
        const el = document.createElement('div');
        document.body.appendChild(el);
        expect(inject(Global, el)).toBe('globalVal');
    });

    it('throws when no provider has the token, naming it and the component', () => {
        const el = document.createElement('app-panel');
        document.body.appendChild(el);
        expect(() => inject(context('missing'), el)).toThrow('No provider for context "missing" above <app-panel>');
    });

    it('with a fallback returns it when no provider has the token', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        expect(inject(context('missing'), el, undefined)).toBeUndefined();
    });

    it('provides signal (reactive value)', () => {
        const Theme = context<Signal<string>>('theme');
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        const theme = signal('light');
        provide(Theme, theme, parent);

        const injected = inject(Theme, child);
        expect(injected()).toBe('light');

        theme.set('dark');
        expect(injected()).toBe('dark');
    });

    it('provides multiple tokens on same element', () => {
        const A = context<number>('a');
        const B = context<number>('b');
        const el = document.createElement('div');
        const child = document.createElement('div');
        el.appendChild(child);
        document.body.appendChild(el);

        provide(A, 1, el);
        provide(B, 2, el);

        expect(inject(A, child)).toBe(1);
        expect(inject(B, child)).toBe(2);
    });

    it('walks through multiple nesting levels', () => {
        const Deep = context<string>('deep');
        const l1 = document.createElement('div');
        const l2 = document.createElement('div');
        const l3 = document.createElement('div');
        const l4 = document.createElement('div');
        l1.appendChild(l2);
        l2.appendChild(l3);
        l3.appendChild(l4);
        document.body.appendChild(l1);

        provide(Deep, 'found', l1);
        expect(inject(Deep, l4)).toBe('found');
    });
});

// `useProvided(key)` left @pdxui/core: a setup injects from its own element.
describe("injecting from the current component's element", () => {
    it('reads what an ancestor of the setup element provides', () => {
        const Config = context<{ api: string }>('config');
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        provide(Config, { api: '/v1' }, parent);

        pushScope(makeFakeScope(child));
        const config = inject(Config, getCurrentScope()!.element);
        popScope();

        expect(config.api).toBe('/v1');
    });
});

// `provideWritable` / `useWritable` left @pdxui/core: a provided signal is writable already.
describe('a provided signal, written by the components below', () => {
    it('a child reads and writes the parent signal', () => {
        const Theme = context<Signal<string>>('theme');
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        const themeSignal = signal('light');
        provide(Theme, themeSignal, parent);

        const theme = inject(Theme, child);
        expect(theme()).toBe('light');
        theme.set('dark');
        expect(themeSignal()).toBe('dark');
        expect(theme()).toBe('dark');
    });

    it('multiple children share the same signal', () => {
        const Shared = context<Signal<string>>('shared');
        const parent = document.createElement('div');
        const child1 = document.createElement('div');
        const child2 = document.createElement('div');
        parent.appendChild(child1);
        parent.appendChild(child2);
        document.body.appendChild(parent);

        const shared = signal('initial');
        provide(Shared, shared, parent);

        const s1 = inject(Shared, child1);
        const s2 = inject(Shared, child2);

        s1.set('from-child1');
        expect(s2()).toBe('from-child1');
        expect(shared()).toBe('from-child1');

        s2.set('from-child2');
        expect(s1()).toBe('from-child2');
    });
});
