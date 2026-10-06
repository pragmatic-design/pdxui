// Coverage (DOM): devtools overlay — toggle, tab switching, render, initDevTools.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toggle, initDevTools } from '../src/devtools/overlay';

// The hook core installs, kept and put back: each test swaps it for data in the shapes core
// produces — the v1 API's `tree()`/`inspect()` for components, the inspector's
// `SignalInfo` and `TraceEntry` under `debug`. A fake in the overlay's private idea of that data
// would let a tab render nothing for real while this file passes.
// devtools-integration.test.ts runs the real inspector.
const hook = () => window as unknown as { __PDX_DEVTOOLS__?: unknown };
const real = hook().__PDX_DEVTOOLS__;

const TREE = [{ id: 1, tag: 'pdx-foo', children: [{ id: 2, tag: 'pdx-bar', children: [] }] }];

function fakeDebug(over: Record<string, unknown> = {}, api: Record<string, unknown> = {}) {
    hook().__PDX_DEVTOOLS__ = {
        tree: () => TREE,
        inspect: (id: number) => ({ id, tag: 'pdx-foo', props: id === 1 ? { title: 'one' } : {}, state: {}, deriveds: {} }),
        ...api,
        debug: {
            signals: () => [{ name: 'count', value: 5, subscriberCount: 2 }],
            traceLog: () => [{ effect: 'fx', trigger: 'count', oldValue: 0, newValue: 5, timestamp: 0 }],
            trace: () => {},
            tracing: true,
            ...over,
        },
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    // NOTE: do not clear document.body — the overlay is a module-level singleton;
    // wiping the DOM would orphan it (the module var still references the detached node).
    fakeDebug();
});
afterEach(() => {
    // Ensure the overlay ends hidden (clears the refresh interval) and timers reset.
    const el = document.getElementById('pdx-devtools');
    if (el && !el.classList.contains('hidden')) toggle();
    vi.useRealTimers();
    hook().__PDX_DEVTOOLS__ = real;
});

describe('devtools overlay', () => {
    it('toggle creates the panel and renders the component tree', () => {
        toggle();
        const el = document.getElementById('pdx-devtools')!;
        expect(el).toBeTruthy();
        expect(el.classList.contains('hidden')).toBe(false);
        const content = el.querySelector('#pdx-devtools-content')!;
        expect(content.innerHTML).toContain('pdx-foo');
        expect(content.innerHTML).toContain('pdx-bar'); // nested child
        expect(content.textContent).toContain('title="one"'); // its props, from inspect()
    });

    it('switches tabs to signals and trace', () => {
        toggle(); // open
        const el = document.getElementById('pdx-devtools')!;
        const content = el.querySelector('#pdx-devtools-content')!;

        (el.querySelector('[data-tab="signals"]') as HTMLElement).click();
        expect(content.innerHTML).toContain('count');
        expect(content.innerHTML).toContain('2 subs');

        (el.querySelector('[data-tab="trace"]') as HTMLElement).click();
        expect(content.innerHTML).toContain('Trace Log');
        expect(content.innerHTML).toContain('count');
    });

    it('close button hides the panel', () => {
        toggle(); // open
        const el = document.getElementById('pdx-devtools')!;
        (el.querySelector('[data-action="close"]') as HTMLElement).click();
        expect(el.classList.contains('hidden')).toBe(true);
    });

    it('shows an empty state when no debug bridge is present', () => {
        delete hook().__PDX_DEVTOOLS__;
        toggle(); // open
        const content = document.querySelector('#pdx-devtools-content')!;
        // It names the missing hook, not the page's components.
        expect(content.innerHTML).toContain('Debug hook not found');
    });

    it('escapes app-controlled values (no XSS in the panel)', () => {
        fakeDebug({
            signals: () => [{ name: 'n', value: '<script>alert(1)</script>', subscriberCount: 0 }],
            traceLog: () => [],
        }, {
            tree: () => [{ id: 9, tag: 'pdx-x', children: [] }],
            inspect: () => ({ id: 9, tag: 'pdx-x', props: { title: '"><img src=x onerror=alert(1)>' }, state: {}, deriveds: {} }),
        });
        toggle();
        const el = document.getElementById('pdx-devtools')!;
        const content = el.querySelector('#pdx-devtools-content')!;
        // Component tab (force it — the overlay singleton may retain a prior active tab).
        (el.querySelector('[data-tab="components"]') as HTMLElement).click();
        // The REAL XSS check: no executable element was injected (a payload string can legitimately
        // appear inside an attribute value or escaped text — that's inert and serialiser-dependent).
        expect(content.querySelectorAll('img').length).toBe(0); // no live <img onerror>
        expect(content.innerHTML).toContain('&lt;img');          // shown escaped as text
        // Signals tab: a markup value must be escaped, not a live <script>.
        (el.querySelector('[data-tab="signals"]') as HTMLElement).click();
        expect(content.querySelector('script')).toBeNull();      // no executable <script> injected
        expect(content.innerHTML).toContain('&lt;script&gt;');   // value shown escaped
    });

    it('initDevTools adds a badge, a global toggle, and a keyboard shortcut', () => {
        initDevTools();
        const badge = [...document.body.querySelectorAll('div')].find(d => d.textContent === 'PDX');
        expect(badge).toBeTruthy();
        expect(typeof (window as any).__PDX_DEVTOOLS_TOGGLE__).toBe('function');

        // Ctrl+Shift+D opens the overlay
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'D', ctrlKey: true, shiftKey: true, bubbles: true }));
        expect(document.getElementById('pdx-devtools')?.classList.contains('hidden')).toBe(false);
    });
});
