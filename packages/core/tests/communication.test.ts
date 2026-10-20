// Tests for Component Communication: expose. The channel and the command dispatcher left the public
// API (#144); their removed-export entries are tested in the compiler (messaging-removed-exports).

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';

let tagId = 200;
function uniqueTag() { return `test-comm-${tagId++}`; }

// ─── Expose ───────────────────────────────────────────────────────

describe('ctx.expose()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('exposes methods on the host element', () => {
        const tag = uniqueTag();

        component(tag, {
            setup(ctx) {
                const isOpen = signal(false);
                ctx.expose({
                    showModal: () => isOpen.set(true),
                    close: () => isOpen.set(false),
                });
                return { isOpen };
            },
            render: () => html`<div>dialog</div>`,
        });

        const el = document.createElement(tag) as any;
        document.body.appendChild(el);

        expect(typeof el.showModal).toBe('function');
        expect(typeof el.close).toBe('function');
    });

    it('exposed methods work correctly', () => {
        const tag = uniqueTag();
        const state = signal(false);

        component(tag, {
            setup(ctx) {
                ctx.expose({
                    open: () => state.set(true),
                    getState: () => state(),
                });
            },
            render: () => html`<div>test</div>`,
        });

        const el = document.createElement(tag) as any;
        document.body.appendChild(el);

        expect(el.getState()).toBe(false);
        el.open();
        expect(el.getState()).toBe(true);
    });

    it('exposed properties are frozen (not writable)', () => {
        const tag = uniqueTag();

        component(tag, {
            setup(ctx) {
                ctx.expose({ getValue: () => 42 });
            },
            render: () => html`<div>test</div>`,
        });

        const el = document.createElement(tag) as any;
        document.body.appendChild(el);

        // Should not be overwritable
        expect(() => { el.getValue = () => 999; }).toThrow();
    });

    it('exposed get x() stays a LIVE accessor (not snapshotted at expose time)', () => {
        const tag = uniqueTag();

        component(tag, {
            setup(ctx) {
                let inner: number | null = null; // filled in after expose, like a form built post-mount
                ctx.expose({ get value() { return inner; } });
                queueMicrotask(() => { inner = 99; });
                return {};
            },
            render: () => html`<div>test</div>`,
        });

        const el = document.createElement(tag) as any;
        document.body.appendChild(el);

        expect(el.value).toBe(null);            // accessor, reads current closure value
        return Promise.resolve().then(() => {
            expect(el.value).toBe(99);          // still live after the closure var changed
        });
    });

    it('exposed signals are readable', () => {
        const tag = uniqueTag();
        const count = signal(5);

        component(tag, {
            setup(ctx) {
                ctx.expose({ count });
                return { count };
            },
            render: () => html`<div>test</div>`,
        });

        const el = document.createElement(tag) as any;
        document.body.appendChild(el);

        expect(el.count()).toBe(5);
    });
});
