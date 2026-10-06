// The inspector's effect and store registries fill.
//
// `effects()` lists the effects that ran, each trace entry carries the effect's `__pdx_name`
// instead of "anonymous", and the stores registered in `__pdx_stores` can be listed — each one a
// wire that can come undone with nothing failing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signal, effect, watch, component, html, __pdx_debug } from '../src/index';
import { createGlobalStore, clearStores } from '../src/reactivity/global-store';

beforeEach(() => {
    __pdx_debug.setLevel(2);
    __pdx_debug.clear();
});

afterEach(() => {
    __pdx_debug.trace(false);
    clearStores();
});

describe('effects()', () => {
    it('lists an effect by the name it was given, with what it read', () => {
        const count = signal(0, { name: 'count' });
        const dispose = effect(() => { count(); }, { name: 'a.pdx:12' });

        const found = __pdx_debug.effects().find((e) => e.name === 'a.pdx:12');
        expect(found, 'the effect is not in the registry').toBeDefined();
        expect(found!.deps).toEqual(['count']);
        expect(found!.active).toBe(true);
        dispose();
    });

    it('a disposed effect leaves the list', () => {
        const dispose = effect(() => {}, { name: 'gone' });
        dispose();
        expect(__pdx_debug.effects().map((e) => e.name)).not.toContain('gone');
    });

    it('the trace names the effect that ran', () => {
        const count = signal(0, { name: 'count' });
        const dispose = effect(() => { count(); }, { name: 'a.pdx:12' });
        __pdx_debug.trace(true);
        count.set(1);

        const entry = __pdx_debug.traceLog().find((t) => t.trigger === 'count');
        expect(entry?.effect, 'the trace still says anonymous').toBe('a.pdx:12');
        dispose();
    });

    it('a signal names the effect subscribed to it', () => {
        const count = signal(0, { name: 'count' });
        const dispose = effect(() => { count(); }, { name: 'a.pdx:12' });
        expect(__pdx_debug.subscribers(count)).toEqual(['a.pdx:12']);
        dispose();
    });

    it('a watch carries its name to the effect behind it', () => {
        const count = signal(0, { name: 'count' });
        const dispose = watch(count, () => {}, { name: 'a.pdx:20' });
        expect(__pdx_debug.effects().map((e) => e.name)).toContain('a.pdx:20');
        dispose();
    });

    it('ctx.track passes the name on — the call the compiler emits for a $effect', () => {
        component('pdx-806-named-effect', {
            setup(ctx) { ctx.track(() => {}, { name: 'named.pdx:3' }); return {}; },
            render: () => html`<p></p>`,
        });
        const el = document.createElement('pdx-806-named-effect');
        document.body.appendChild(el);
        expect(__pdx_debug.effects().map((e) => e.name)).toContain('named.pdx:3');
        el.remove();
    });

    it('below level 2 nothing is registered', () => {
        __pdx_debug.setLevel(1);
        const dispose = effect(() => {}, { name: 'quiet' });
        __pdx_debug.setLevel(2);
        expect(__pdx_debug.effects().map((e) => e.name)).not.toContain('quiet');
        dispose();
    });
});

describe('stores()', () => {
    it('lists a global store with a snapshot of its state', () => {
        createGlobalStore('cart', () => ({ items: signal(['a']), total: 3 }));
        expect(__pdx_debug.stores()).toContainEqual({ id: 'cart', snapshot: { items: ['a'], total: 3 } });
    });

    it('the snapshot is read when asked, not when the store was made', () => {
        const store = createGlobalStore('counter', () => ({ n: signal(0) }));
        store.n.set(5);
        expect(__pdx_debug.stores().find((s) => s.id === 'counter')?.snapshot).toEqual({ n: 5 });
    });

    it('no global is written for it', () => {
        createGlobalStore('quiet-store', () => ({ n: signal(0) }));
        expect((window as { __pdx_stores?: unknown }).__pdx_stores).toBeUndefined();
    });
});
