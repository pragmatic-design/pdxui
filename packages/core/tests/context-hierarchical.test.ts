// Tests for hierarchical provide/inject and useProvided composable.

import { describe, it, expect, beforeEach } from 'vitest';
import { provide, inject, tryInject, useProvided, tryUseProvided, provideWritable, useWritable, tryUseWritable, clearProviders } from '../src/component/context';
import { signal } from '../src/reactivity/signal';
import { pushScope, popScope } from '../src/component/lifecycle';
import type { ComponentScope } from '../src/component/lifecycle';

beforeEach(() => {
    clearProviders();
    document.body.innerHTML = '';
});

describe('hierarchical provide/inject', () => {
    it('provides on parent, injects from child', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);
        provide('key', 'value', parent);
        expect(inject('key', child)).toBe('value');
    });

    it('injects from ancestor element', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        provide('theme', 'dark', parent);
        expect(inject('theme', child)).toBe('dark');
    });

    it('nearest ancestor wins (scoped override)', () => {
        const grandparent = document.createElement('div');
        const parent = document.createElement('div');
        const child = document.createElement('div');
        grandparent.appendChild(parent);
        parent.appendChild(child);
        document.body.appendChild(grandparent);

        provide('theme', 'light', grandparent);
        provide('theme', 'dark', parent);

        expect(inject('theme', child)).toBe('dark');
    });

    it('falls back to global registry', () => {
        provide('globalKey', 'globalVal');
        const el = document.createElement('div');
        document.body.appendChild(el);
        expect(inject('globalKey', el)).toBe('globalVal');
    });

    it('throws when key not found', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        expect(() => inject('missing', el)).toThrow('No provider found');
    });

    it('tryInject returns undefined when not found', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        expect(tryInject('missing', el)).toBeUndefined();
    });

    it('provides signal (reactive value)', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        const theme = signal('light');
        provide('theme', theme, parent);

        const injected = inject<typeof theme>('theme', child);
        expect(injected()).toBe('light');

        theme.set('dark');
        expect(injected()).toBe('dark');
    });

    it('provides multiple keys on same element', () => {
        const el = document.createElement('div');
        const child = document.createElement('div');
        el.appendChild(child);
        document.body.appendChild(el);

        provide('a', 1, el);
        provide('b', 2, el);

        expect(inject('a', child)).toBe(1);
        expect(inject('b', child)).toBe(2);
    });

    it('walks through multiple nesting levels', () => {
        const l1 = document.createElement('div');
        const l2 = document.createElement('div');
        const l3 = document.createElement('div');
        const l4 = document.createElement('div');
        l1.appendChild(l2);
        l2.appendChild(l3);
        l3.appendChild(l4);
        document.body.appendChild(l1);

        provide('deep', 'found', l1);
        expect(inject('deep', l4)).toBe('found');
    });
});

describe('useProvided composable', () => {
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

    it('injects from current scope element', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        provide('config', { api: '/v1' }, parent);

        pushScope(makeFakeScope(child));
        const config = useProvided<{ api: string }>('config');
        popScope();

        expect(config.api).toBe('/v1');
    });

    it('throws outside setup', () => {
        expect(() => useProvided('x')).toThrow('must be called during component setup');
    });

    it('tryUseProvided returns undefined outside setup', () => {
        expect(tryUseProvided('x')).toBeUndefined();
    });

    it('tryUseProvided returns undefined when key not found', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        pushScope(makeFakeScope(el));
        const val = tryUseProvided('nonexistent');
        popScope();
        expect(val).toBeUndefined();
    });
});

describe('bidirectional context (provideWritable / useWritable)', () => {
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

    it('child reads and writes parent signal', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        const themeSignal = signal('light');
        provideWritable('theme', themeSignal, parent);

        pushScope(makeFakeScope(child));
        const theme = useWritable<string>('theme');
        popScope();

        // Child reads
        expect(theme()).toBe('light');
        // Child writes — parent sees it
        theme.set('dark');
        expect(themeSignal()).toBe('dark');
        expect(theme()).toBe('dark');
    });

    it('throws if provider value is not a signal', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        provide('notSignal', 'plain-string', parent);

        pushScope(makeFakeScope(child));
        expect(() => useWritable('notSignal')).toThrow('not a writable signal');
        popScope();
    });

    it('throws if no provider exists', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);

        pushScope(makeFakeScope(el));
        expect(() => useWritable('missing')).toThrow('No writable provider');
        popScope();
    });

    it('tryUseWritable returns undefined for non-signal provider', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        provide('plain', 42, parent);

        pushScope(makeFakeScope(child));
        expect(tryUseWritable('plain')).toBeUndefined();
        popScope();
    });

    it('tryUseWritable returns signal when available', () => {
        const parent = document.createElement('div');
        const child = document.createElement('div');
        parent.appendChild(child);
        document.body.appendChild(parent);

        const counter = signal(0);
        provideWritable('counter', counter, parent);

        pushScope(makeFakeScope(child));
        const c = tryUseWritable<number>('counter');
        popScope();

        expect(c).toBeDefined();
        c!.set(5);
        expect(counter()).toBe(5);
    });

    it('multiple children share the same writable signal', () => {
        const parent = document.createElement('div');
        const child1 = document.createElement('div');
        const child2 = document.createElement('div');
        parent.appendChild(child1);
        parent.appendChild(child2);
        document.body.appendChild(parent);

        const shared = signal('initial');
        provideWritable('shared', shared, parent);

        pushScope(makeFakeScope(child1));
        const s1 = useWritable<string>('shared');
        popScope();

        pushScope(makeFakeScope(child2));
        const s2 = useWritable<string>('shared');
        popScope();

        s1.set('from-child1');
        expect(s2()).toBe('from-child1');
        expect(shared()).toBe('from-child1');

        s2.set('from-child2');
        expect(s1()).toBe('from-child2');
    });
});
