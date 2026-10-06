// Tests for Component Communication: expose, channel, commands.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import { createChannel, createCommands } from '../src/component/channel';

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

// ─── Channel ──────────────────────────────────────────────────────

describe('createChannel()', () => {
    it('sends commands down and receives events up', () => {
        interface TestChannel {
            down: { refresh: void; setPage: { page: number } };
            up: { selected: { id: string } };
        }

        const ch = createChannel<TestChannel>();
        const refreshed = vi.fn();
        const pageSet = vi.fn();
        const selected = vi.fn();

        // Child listens for commands
        ch.on('refresh', refreshed);
        ch.on('setPage', pageSet);

        // Parent listens for events
        ch.on('selected', selected);

        // Parent sends commands
        ch.send('refresh');
        ch.send('setPage', { page: 3 });

        expect(refreshed).toHaveBeenCalledOnce();
        expect(pageSet).toHaveBeenCalledWith({ page: 3 });

        // Child emits events
        ch.emit('selected', { id: 'abc' });
        expect(selected).toHaveBeenCalledWith({ id: 'abc' });
    });

    it('returns unsubscribe function from on()', () => {
        interface TestChannel {
            down: { ping: void };
            up: {};
        }

        const ch = createChannel<TestChannel>();
        const handler = vi.fn();

        const unsub = ch.on('ping', handler);
        ch.send('ping');
        expect(handler).toHaveBeenCalledOnce();

        unsub();
        ch.send('ping');
        expect(handler).toHaveBeenCalledOnce(); // not called again
    });

    it('dispose removes all listeners', () => {
        interface TestChannel {
            down: { a: void; b: void };
            up: { c: void };
        }

        const ch = createChannel<TestChannel>();
        const handler = vi.fn();

        ch.on('a', handler);
        ch.on('b', handler);
        ch.on('c', handler);

        ch.dispose();

        ch.send('a');
        ch.send('b');
        ch.emit('c');
        expect(handler).not.toHaveBeenCalled();
    });

    it('channel is frozen (immutable)', () => {
        const ch = createChannel<{ down: {}; up: {} }>();
        expect(() => { (ch as any).hack = true; }).toThrow();
    });

    it('multiple listeners per event', () => {
        interface TestChannel {
            down: { update: { value: number } };
            up: {};
        }

        const ch = createChannel<TestChannel>();
        const fn1 = vi.fn();
        const fn2 = vi.fn();

        ch.on('update', fn1);
        ch.on('update', fn2);

        ch.send('update', { value: 42 });
        expect(fn1).toHaveBeenCalledWith({ value: 42 });
        expect(fn2).toHaveBeenCalledWith({ value: 42 });
    });
});

// ─── Commands ─────────────────────────────────────────────────────

describe('createCommands()', () => {
    it('sends commands and child listens', () => {
        type GridCommands = {
            refresh: void;
            scrollTo: { row: number };
        };

        const cmds = createCommands<GridCommands>();
        const refreshed = vi.fn();
        const scrolled = vi.fn();

        cmds.on('refresh', refreshed);
        cmds.on('scrollTo', scrolled);

        cmds.send('refresh');
        cmds.send('scrollTo', { row: 5 });

        expect(refreshed).toHaveBeenCalledOnce();
        expect(scrolled).toHaveBeenCalledWith({ row: 5 });
    });

    it('commands are frozen (immutable)', () => {
        const cmds = createCommands<{ ping: void }>();
        expect(() => { (cmds as any).hack = true; }).toThrow();
    });

    it('off removes specific listener', () => {
        const cmds = createCommands<{ tick: void }>();
        const handler = vi.fn();

        cmds.on('tick', handler);
        cmds.send('tick');
        expect(handler).toHaveBeenCalledOnce();

        cmds.off('tick', handler);
        cmds.send('tick');
        expect(handler).toHaveBeenCalledOnce(); // not called again
    });
});

// ─── Integration: expose + channel in component ───────────────────

describe('component integration', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('full pattern: parent creates channel, child uses it via prop', () => {
        const log: string[] = [];

        interface WidgetChannel {
            down: { refresh: void };
            up: { loaded: { count: number } };
        }

        const ch = createChannel<WidgetChannel>();

        // Parent listens for events from child
        ch.on('loaded', ({ count }) => log.push(`loaded:${count}`));

        const tag = uniqueTag();
        component(tag, {
            props: { channel: { type: Object } },
            setup() {
                // Child would normally get channel from prop and listen
                // For this test, use the ch directly
                ch.on('refresh', () => {
                    log.push('child:refreshed');
                    ch.emit('loaded', { count: 42 });
                });
            },
            render: () => html`<div>widget</div>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);

        // Parent sends command
        ch.send('refresh');

        expect(log).toEqual(['child:refreshed', 'loaded:42']);
    });
});
