// Tests for lifecycle hooks: onShow, onHide, onPropsChange, onBeforeLeave, onRouteChange.

import { describe, it, expect } from 'vitest';
import { pushScope, popScope, onShow, onHide, onPropsChange, onBeforeLeave, onRouteChange } from '../src/component/lifecycle';
import type { ComponentScope, PropChange } from '../src/component/lifecycle';

function createTestScope(): ComponentScope & {
    mountCbs: (() => void)[];
    destroyCbs: (() => void)[];
    showCbs: (() => void)[];
    hideCbs: (() => void)[];
    propsChangeCbs: ((changes: PropChange[]) => void)[];
    beforeLeaveCbs: (() => boolean | 'destroy' | Promise<boolean>)[];
    routeChangeCbs: ((params: Record<string, string>) => void)[];
} {
    const mountCbs: (() => void)[] = [];
    const destroyCbs: (() => void)[] = [];
    const showCbs: (() => void)[] = [];
    const hideCbs: (() => void)[] = [];
    const propsChangeCbs: ((changes: PropChange[]) => void)[] = [];
    const beforeLeaveCbs: (() => boolean | 'destroy' | Promise<boolean>)[] = [];
    const routeChangeCbs: ((params: Record<string, string>) => void)[] = [];

    return {
        track: (fn) => { fn(); return () => {}; },
        registerMount: (fn) => mountCbs.push(fn),
        registerDestroy: (fn) => destroyCbs.push(fn),
        registerUpdated: () => {},
        registerError: () => {},
        registerShow: (fn) => showCbs.push(fn),
        registerHide: (fn) => hideCbs.push(fn),
        registerPropsChange: (fn) => propsChangeCbs.push(fn),
        registerBeforeLeave: (fn) => beforeLeaveCbs.push(fn),
        registerRouteChange: (fn) => routeChangeCbs.push(fn),
        element: document.createElement('div'),
        mountCbs, destroyCbs, showCbs, hideCbs, propsChangeCbs, beforeLeaveCbs, routeChangeCbs,
    };
}

describe('onShow()', () => {
    it('registers callback during setup', () => {
        const scope = createTestScope();
        pushScope(scope);
        onShow(() => {});
        popScope();
        expect(scope.showCbs).toHaveLength(1);
    });

    it('throws outside setup', () => {
        expect(() => onShow(() => {})).toThrow('outside component setup');
    });
});

describe('onHide()', () => {
    it('registers callback during setup', () => {
        const scope = createTestScope();
        pushScope(scope);
        onHide(() => {});
        popScope();
        expect(scope.hideCbs).toHaveLength(1);
    });

    it('throws outside setup', () => {
        expect(() => onHide(() => {})).toThrow('outside component setup');
    });
});

describe('onPropsChange()', () => {
    it('registers callback during setup', () => {
        const scope = createTestScope();
        pushScope(scope);
        const changes: PropChange[] = [];
        onPropsChange((c) => changes.push(...c));
        popScope();
        expect(scope.propsChangeCbs).toHaveLength(1);

        // Simulate prop change
        scope.propsChangeCbs[0]([{ name: 'total', oldValue: 0, newValue: 5 }]);
        expect(changes).toHaveLength(1);
        expect(changes[0]).toEqual({ name: 'total', oldValue: 0, newValue: 5 });
    });

    it('throws outside setup', () => {
        expect(() => onPropsChange(() => {})).toThrow('outside component setup');
    });
});

describe('onBeforeLeave()', () => {
    it('registers guard callback', () => {
        const scope = createTestScope();
        pushScope(scope);
        onBeforeLeave(() => false);
        popScope();
        expect(scope.beforeLeaveCbs).toHaveLength(1);
        expect(scope.beforeLeaveCbs[0]()).toBe(false);
    });

    it('supports destroy return value', () => {
        const scope = createTestScope();
        pushScope(scope);
        onBeforeLeave(() => 'destroy');
        popScope();
        expect(scope.beforeLeaveCbs[0]()).toBe('destroy');
    });

    it('supports async guards', async () => {
        const scope = createTestScope();
        pushScope(scope);
        onBeforeLeave(async () => {
            await new Promise(r => setTimeout(r, 10));
            return true;
        });
        popScope();
        const result = await scope.beforeLeaveCbs[0]();
        expect(result).toBe(true);
    });

    it('throws outside setup', () => {
        expect(() => onBeforeLeave(() => true)).toThrow('outside component setup');
    });
});

describe('onRouteChange()', () => {
    it('registers callback with params', () => {
        const scope = createTestScope();
        pushScope(scope);
        const received: Record<string, string>[] = [];
        onRouteChange((params) => received.push(params));
        popScope();

        scope.routeChangeCbs[0]({ id: '42' });
        expect(received).toHaveLength(1);
        expect(received[0]).toEqual({ id: '42' });
    });

    it('throws outside setup', () => {
        expect(() => onRouteChange(() => {})).toThrow('outside component setup');
    });
});
