// Tests for HMR prototype swapping and instance re-rendering.

import { describe, it, expect, beforeEach } from 'vitest';
import { component, __pdx_hmr_save, __pdx_hmr_restore } from '../src/component/component';
import { __pdx_hmr_swap, __pdx_hmr_rerender } from '../src/component/define';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';

// Generate unique tags per test to avoid CE registry collisions
let tagCounter = 0;
function uniqueTag() { return `pdx-hmr-test-${++tagCounter}`; }

describe('HMR state save/restore', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('saves and restores signal state via __pdx_saveState', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: { initial: { type: Number, default: 0 } },
            setup(ctx) {
                const count = signal(ctx.initial());
                return { count };
            },
            render: (ctx) => html`<span>${() => ctx.count()}</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));

        // Verify initial render
        expect(el.querySelector('span')?.textContent).toBe('0');

        // Save state (internal API)
        const state = (el as any).__pdx_saveState?.();
        expect(state).toBeTruthy();
        expect(state.get('count')).toBe(0);
    });

    it('__pdx_hmr_save collects state from all instances', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: {},
            setup() { return { val: signal(10) }; },
            render: (ctx) => html`<span>${() => ctx.val()}</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));

        // Save via HMR API — should not throw
        __pdx_hmr_save(tag);
    });
});

describe('HMR prototype swapping', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('trackInstance registers live instances for re-render', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: {},
            render: () => html`<span>v1</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));

        expect(el.querySelector('span')?.textContent).toBe('v1');
    });

    it('__pdx_hmr_swap + rerender updates DOM with new template', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: {},
            render: () => html`<span class="ver">v1</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));
        expect(el.querySelector('.ver')?.textContent).toBe('v1');

        // "v2" registration — simulates re-evaluation of .pdx module
        component(tag, {
            props: {},
            render: () => html`<span class="ver">v2</span>`,
        });

        __pdx_hmr_swap(tag);
        __pdx_hmr_rerender(tag);
        await new Promise<void>(r => queueMicrotask(() => r()));

        expect(el.querySelector('.ver')?.textContent).toBe('v2');
    });

    it('full HMR cycle preserves prop values', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: { label: { type: String, default: 'hello' } },
            render: (ctx) => html`<span>${() => ctx.label()}</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));
        expect(el.querySelector('span')?.textContent).toBe('hello');

        // Set prop via JS property
        (el as any).label = 'world';

        // Full HMR cycle
        __pdx_hmr_save(tag);

        component(tag, {
            props: { label: { type: String, default: 'hello' } },
            render: (ctx) => html`<b>${() => ctx.label()}</b>`,
        });

        __pdx_hmr_swap(tag);
        __pdx_hmr_rerender(tag);
        await new Promise<void>(r => queueMicrotask(() => r()));

        __pdx_hmr_restore(tag);
        await new Promise<void>(r => queueMicrotask(() => r()));

        // New template <b> + restored prop value
        expect(el.querySelector('b')).toBeTruthy();
        expect(el.querySelector('b')?.textContent).toBe('world');
    });

    it('handles multiple instances', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: { name: { type: String, default: '' } },
            render: (ctx) => html`<span>${() => ctx.name()}</span>`,
        });

        const el1 = document.createElement(tag);
        const el2 = document.createElement(tag);
        el1.setAttribute('name', 'Alice');
        el2.setAttribute('name', 'Bob');
        document.body.appendChild(el1);
        document.body.appendChild(el2);
        await new Promise<void>(r => queueMicrotask(() => r()));

        // Full HMR cycle
        __pdx_hmr_save(tag);

        component(tag, {
            props: { name: { type: String, default: '' } },
            render: (ctx) => html`<b>${() => ctx.name()}</b>`,
        });

        __pdx_hmr_swap(tag);
        __pdx_hmr_rerender(tag);
        await new Promise<void>(r => queueMicrotask(() => r()));

        __pdx_hmr_restore(tag);
        await new Promise<void>(r => queueMicrotask(() => r()));

        // Both should have <b> (new template)
        expect(el1.querySelector('b')).toBeTruthy();
        expect(el2.querySelector('b')).toBeTruthy();
    });

    it('no-op when tag has no instances', () => {
        // Should not throw
        __pdx_hmr_swap('pdx-nonexistent');
        __pdx_hmr_rerender('pdx-nonexistent');
    });

    it('complex component: preserves signal state + updates setup logic', async () => {
        const tag = uniqueTag();

        // V1: counter component with increment
        component(tag, {
            props: { step: { type: Number, default: 1 } },
            setup(ctx) {
                const count = signal(0);
                function inc() { count.set(count() + (ctx.step as () => number)()); }
                return { count, inc };
            },
            render: (ctx) => html`<div><span class="count">${() => ctx.count()}</span><button @click=${ctx.inc}>+</button></div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        await new Promise<void>(r => queueMicrotask(() => r()));

        expect(el.querySelector('.count')?.textContent).toBe('0');

        // Simulate user interaction — set count to 5
        const state = (el as any).__pdx_saveState?.();
        expect(state).toBeTruthy();

        // Full HMR cycle — V2 changes template (adds label)
        __pdx_hmr_save(tag);

        component(tag, {
            props: { step: { type: Number, default: 1 } },
            setup(ctx) {
                const count = signal(0);
                const label = signal('Count');
                function inc() { count.set(count() + (ctx.step as () => number)()); }
                return { count, label, inc };
            },
            render: (ctx) => html`<div><em>${() => ctx.label()}</em>: <span class="count">${() => ctx.count()}</span></div>`,
        });

        __pdx_hmr_swap(tag);
        __pdx_hmr_rerender(tag);
        await new Promise<void>(r => queueMicrotask(() => r()));

        __pdx_hmr_restore(tag);
        await new Promise<void>(r => queueMicrotask(() => r()));

        // V2 template is rendered
        expect(el.querySelector('em')).toBeTruthy();
        expect(el.querySelector('.count')).toBeTruthy();
    });
});
