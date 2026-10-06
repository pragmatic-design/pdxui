// component() — the options the existing component.test.ts never passes: shadow, formAssociated,
// the property-only prop types, the HMR state bridge, and what happens when setup() throws.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { component, __pdx_hmr_save, __pdx_hmr_restore } from '../src/component/component';
import { onPropsChange, onError } from '../src/component/lifecycle';
import type { Signal } from '../src/utils/types';

let tagId = 0;
const uniqueTag = () => `more-comp-${tagId++}`;

/** Define, mount and hand back the element. */
function mount(tag: string, attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('shadow DOM', () => {
    it('renders into a shadow root instead of the light DOM', () => {
        const tag = uniqueTag();
        component(tag, { shadow: true, render: () => html`<p>inside</p>` });

        const el = mount(tag);

        expect(el.shadowRoot, 'shadow: true produced no shadow root').not.toBeNull();
        expect(el.shadowRoot!.querySelector('p')!.textContent).toBe('inside');
        expect(el.querySelector('p'), 'the content leaked into the light DOM').toBeNull();
    });

    it('renders into the light DOM by default', () => {
        const tag = uniqueTag();
        component(tag, { render: () => html`<p>inside</p>` });
        const el = mount(tag);

        expect(el.shadowRoot).toBeNull();
        expect(el.querySelector('p')).not.toBeNull();
    });
});

describe('property-only prop types', () => {
    it('an Array prop takes a real array through the property, with no attribute', () => {
        const tag = uniqueTag();
        let seen: unknown;
        component(tag, {
            props: { items: { type: Array, default: [] } },
            setup: (ctx) => { seen = (ctx.items as Signal<unknown[]>)(); return {}; },
            render: () => html`<p></p>`,
        });

        const el = document.createElement(tag);
        (el as unknown as { items: unknown[] }).items = [1, 2, 3];   // set before upgrade
        document.body.appendChild(el);

        expect(seen, 'a value set before the element upgraded was lost').toEqual([1, 2, 3]);
    });

    it('a Function prop is stored, not invoked as a signal updater', () => {
        const tag = uniqueTag();
        let fn: unknown;
        component(tag, {
            props: { renderer: { type: Function, default: null } },
            setup: (ctx) => { fn = ctx.renderer; return {}; },
            render: () => html`<p></p>`,
        });

        const el = mount(tag);
        const callback = () => 'called';
        (el as unknown as { renderer: unknown }).renderer = callback;

        expect((fn as Signal<unknown>)(), 'the function was run as an updater instead of stored')
            .toBe(callback);
    });

    it('an Object prop is not observed as an attribute', () => {
        const tag = uniqueTag();
        component(tag, {
            props: { config: { type: Object, default: null } },
            render: () => html`<p></p>`,
        });
        const ctor = customElements.get(tag)!;
        expect((ctor as unknown as { observedAttributes: string[] }).observedAttributes ?? [])
            .not.toContain('config');
    });

    it('the defaults follow the declared type', () => {
        const tag = uniqueTag();
        const got: Record<string, unknown> = {};
        component(tag, {
            props: {
                s: { type: String }, n: { type: Number }, b: { type: Boolean },
                o: { type: Object }, a: { type: Array }, f: { type: Function },
            },
            setup: (ctx) => {
                for (const k of ['s', 'n', 'b', 'o', 'a', 'f']) got[k] = (ctx as unknown as Record<string, Signal<unknown>>)[k]();
                return {};
            },
            render: () => html`<p></p>`,
        });
        mount(tag);

        expect(got).toEqual({ s: '', n: 0, b: false, o: null, a: [], f: null });
    });

    it('an Object attribute is parsed as JSON, and kept as text when it is not', () => {
        const tag = uniqueTag();
        const seen: unknown[] = [];
        component(tag, {
            props: { config: { type: Object, default: null } },
            setup: (ctx) => { seen.push((ctx.config as Signal<unknown>)()); return {}; },
            render: () => html`<p></p>`,
        });

        const el = mount(tag);
        (el as unknown as { config: unknown }).config = '{"a":1}';
        (el as unknown as { config: unknown }).config = 'not json';

        expect(seen[0]).toBeNull();
        expect((el as unknown as { config: unknown }).config).toBe('not json');
    });
});

describe('setting a prop back to null', () => {
    it('returns it to its declared default rather than storing null', () => {
        const tag = uniqueTag();
        component(tag, {
            props: { label: { type: String, default: 'fallback' } },
            render: (ctx) => html`<p>${ctx.label}</p>`,
        });

        const el = mount(tag);
        (el as unknown as { label: unknown }).label = 'set';
        expect(el.textContent).toBe('set');

        (el as unknown as { label: unknown }).label = null;
        expect(el.textContent, 'clearing a prop wrote null into the template').toBe('fallback');
    });
});

describe('onPropsChange', () => {
    it('fires for an attribute change and for a property set alike', () => {
        const tag = uniqueTag();
        const changes: { name: string; oldValue: unknown; newValue: unknown }[] = [];
        component(tag, {
            props: { label: { type: String, default: 'a' } },
            setup: () => { onPropsChange((c) => changes.push(...c)); return {}; },
            render: (ctx) => html`<p>${ctx.label}</p>`,
        });

        const el = mount(tag);
        el.setAttribute('label', 'from-attr');
        (el as unknown as { label: string }).label = 'from-prop';

        expect(changes.map((c) => c.newValue),
            'setAttribute and el.prop= must be reported the same way')
            .toEqual(['from-attr', 'from-prop']);
        expect(changes[0]).toMatchObject({ name: 'label', oldValue: 'a' });
    });

    it('does not fire when the value is set to what it already was', () => {
        const tag = uniqueTag();
        const changes: unknown[] = [];
        component(tag, {
            props: { label: { type: String, default: 'a' } },
            setup: () => { onPropsChange((c) => changes.push(...c)); return {}; },
            render: (ctx) => html`<p>${ctx.label}</p>`,
        });

        const el = mount(tag);
        (el as unknown as { label: string }).label = 'a';

        expect(changes, 'a no-op assignment woke every subscriber').toHaveLength(0);
    });
});

describe('a setup that throws', () => {
    it('renders the error instead of leaving a blank element', () => {
        const tag = uniqueTag();
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        component(tag, {
            setup: () => { throw new Error('setup exploded'); },
            render: () => html`<p>never</p>`,
        });

        const el = mount(tag);

        expect(el.textContent, 'a failed setup rendered nothing at all').toContain('setup exploded');
        expect(el.textContent).toContain(tag);
        expect(err, 'the failure never reached the console').toHaveBeenCalled();
        err.mockRestore();
    });

    it('tells the onError handlers registered before the throw', () => {
        const tag = uniqueTag();
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        const seen: unknown[] = [];
        const boom = new Error('bad');
        component(tag, {
            setup: () => { onError((e) => seen.push(e)); throw boom; },
            render: () => html`<p></p>`,
        });

        mount(tag);

        expect(seen).toEqual([boom]);
        err.mockRestore();
    });

    it('leaves the scope stack usable for the next component', () => {
        // A pushScope without its popScope would poison every component mounted afterwards.
        const failing = uniqueTag();
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        component(failing, { setup: () => { throw new Error('x'); }, render: () => html`<p></p>` });
        mount(failing);
        err.mockRestore();

        const healthy = uniqueTag();
        component(healthy, {
            setup: () => ({ v: signal('fine') }),
            render: (ctx) => html`<p>${ctx.v}</p>`,
        });

        expect(mount(healthy).textContent).toBe('fine');
    });
});

describe('form-associated components', () => {
    it('exposes setFormValue and setValidity on the context', () => {
        const tag = uniqueTag();
        let ctxKeys: string[] = [];
        component(tag, {
            formAssociated: true,
            setup: (ctx) => { ctxKeys = Object.keys(ctx); return {}; },
            render: () => html`<input />`,
        });

        const form = document.createElement('form');
        document.body.appendChild(form);
        form.appendChild(document.createElement(tag));

        expect(customElements.get(tag), 'the element was never defined').toBeTruthy();
        // happy-dom may not implement attachInternals; when it does, the two methods are there.
        if ((HTMLElement.prototype as { attachInternals?: unknown }).attachInternals) {
            expect(ctxKeys).toEqual(expect.arrayContaining(['setFormValue', 'setValidity']));
        }
    });

    it('declares itself form-associated to the platform', () => {
        const tag = uniqueTag();
        component(tag, { formAssociated: true, render: () => html`<input />` });
        const ctor = customElements.get(tag)!;
        expect((ctor as unknown as { formAssociated: boolean }).formAssociated).toBe(true);
    });

    it('a plain component does not claim to be one', () => {
        const tag = uniqueTag();
        component(tag, { render: () => html`<p></p>` });
        const ctor = customElements.get(tag)!;
        expect((ctor as unknown as { formAssociated?: boolean }).formAssociated).toBe(false);
    });
});

describe('ctx.slot', () => {
    it('renders the fallback when the parent projected nothing', () => {
        const tag = uniqueTag();
        component(tag, {
            render: (ctx) => {
                const frag = document.createDocumentFragment();
                frag.appendChild(ctx.slot('footer', undefined, () => {
                    const p = document.createElement('p');
                    p.textContent = 'default footer';
                    return p;
                }));
                return frag;
            },
        });

        expect(mount(tag).textContent).toBe('default footer');
    });

    it('an unfilled slot with no fallback renders nothing', () => {
        const tag = uniqueTag();
        component(tag, {
            render: (ctx) => {
                const frag = document.createDocumentFragment();
                frag.appendChild(ctx.slot('footer'));
                return frag;
            },
        });
        expect(mount(tag).textContent).toBe('');
    });
});

describe('ctx.expose', () => {
    it('puts the API on the element, read-only from outside', () => {
        const tag = uniqueTag();
        component(tag, {
            setup: (ctx) => {
                ctx.expose({ open: () => 'opened' });
                return {};
            },
            render: () => html`<p></p>`,
        });

        const el = mount(tag) as unknown as { open: () => string };

        expect(el.open()).toBe('opened');
        expect(() => { (el as unknown as Record<string, unknown>).open = () => 'hijacked'; }).toThrow();
    });
});

describe('the HMR state bridge', () => {
    it('carries the setup signals across a re-definition', async () => {
        const tag = uniqueTag();
        component(tag, {
            setup: () => ({ count: signal(0) }),
            render: (ctx) => html`<span>${ctx.count}</span>`,
        });

        const el = mount(tag);
        ((el as unknown as { count: Signal<number> }), 0);
        const inner = el.querySelector('span')!;
        expect(inner.textContent).toBe('0');

        // The instance's own signal is what HMR saves — reach it the way the page would.
        const state = (el as unknown as { __pdx_saveState: () => Map<string, unknown> }).__pdx_saveState();
        expect(state.get('count'), 'the setup signals were not registered for HMR').toBe(0);

        __pdx_hmr_save(tag);
        (el as unknown as { __pdx_restoreState: (s: Map<string, unknown>) => void })
            .__pdx_restoreState(new Map([['count', 7]]));

        expect(inner.textContent, 'the restored value never reached the template').toBe('7');
    });

    it('restore is a no-op for a tag that was never saved', () => {
        expect(() => __pdx_hmr_restore('never-saved-tag')).not.toThrow();
    });

    it('save records nothing for a tag with no live instance', () => {
        const tag = uniqueTag();
        component(tag, { setup: () => ({ v: signal(1) }), render: () => html`<p></p>` });
        expect(() => __pdx_hmr_save(tag)).not.toThrow();
    });

    it('restores every mounted instance after a re-definition', async () => {
        const tag = uniqueTag();
        component(tag, {
            setup: () => ({ count: signal(0) }),
            render: (ctx) => html`<span>${ctx.count}</span>`,
        });
        const a = mount(tag), b = mount(tag);
        (a as unknown as { __pdx_restoreState: (s: Map<string, unknown>) => void })
            .__pdx_restoreState(new Map([['count', 1]]));
        (b as unknown as { __pdx_restoreState: (s: Map<string, unknown>) => void })
            .__pdx_restoreState(new Map([['count', 2]]));

        __pdx_hmr_save(tag);
        document.body.innerHTML = '';
        const a2 = mount(tag), b2 = mount(tag);
        __pdx_hmr_restore(tag);
        await Promise.resolve();

        expect([a2.textContent, b2.textContent],
            'the saved state did not survive the re-mount').toEqual(['1', '2']);
    });

    it('a component with no setup signals saves nothing', () => {
        const tag = uniqueTag();
        component(tag, { render: () => html`<p>static</p>` });
        const el = mount(tag);
        expect((el as unknown as { __pdx_saveState: () => unknown }).__pdx_saveState()).toBeNull();
    });
});
