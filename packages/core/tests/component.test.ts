import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { component } from '../src/component/component';
import type { Signal } from '../src/utils/types';
import { waitUntil } from './wait-until';

let tagId = 0;
function uniqueTag() { return `test-comp-${tagId++}`; }

describe('component()', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('renders basic component', () => {
        const tag = uniqueTag();
        component(tag, {
            render: () => html`<span>Hello</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(el.querySelector('span')?.textContent).toBe('Hello');
    });

    it('projects light-DOM children added AFTER connect (late slot, Angular-style)', async () => {
        const tag = uniqueTag();
        component(tag, { render: () => html`<div class="inner"><slot></slot></div>` });
        const el = document.createElement(tag);
        document.body.appendChild(el); // connect: no children yet → empty slot + observer armed
        el.appendChild(document.createTextNode('Late content')); // framework appends after connect
        await waitUntil(() => (el.querySelector('.inner')?.textContent ?? '').includes('Late content'), 'the MutationObserver to project the late child');
        expect(el.querySelector('.inner')?.textContent).toContain('Late content');
    });

    it('provides props as signals with defaults', () => {
        const tag = uniqueTag();
        component(tag, {
            props: {
                label: { type: String, default: 'default' },
            },
            render: (ctx) => html`<span>${ctx.label as Signal<string>}</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(el.querySelector('span')?.textContent).toBe('default');
    });

    it('reads props from HTML attributes', () => {
        const tag = uniqueTag();
        component(tag, {
            props: {
                label: { type: String, default: '' },
            },
            render: (ctx) => html`<span>${ctx.label as Signal<string>}</span>`,
        });

        const el = document.createElement(tag);
        el.setAttribute('label', 'Custom');
        document.body.appendChild(el);
        expect(el.querySelector('span')?.textContent).toBe('Custom');
    });

    it('syncs camelCase props from kebab-case attributes (aria-*, data-*, max-length)', () => {
        // Regression: the standard hyphenated attributes (aria-label, max-length...)
        // must sync the camelCase prop, not only the lowercase form with no hyphen.
        const tag = uniqueTag();
        component(tag, {
            props: {
                ariaLabel: { type: String, default: '' },
                maxLength: { type: Number, default: 0 },
            },
            render: (ctx) => html`<span>${ctx.ariaLabel as Signal<string>}|${() => String((ctx.maxLength as Signal<number>)())}</span>`,
        });

        const el = document.createElement(tag);
        el.setAttribute('aria-label', 'Quantità');
        el.setAttribute('max-length', '5');
        document.body.appendChild(el);
        expect(el.querySelector('span')?.textContent).toBe('Quantità|5');
    });

    it('reactively updates camelCase prop when kebab attribute changes', () => {
        const tag = uniqueTag();
        component(tag, {
            props: { ariaLabel: { type: String, default: 'x' } },
            render: (ctx) => html`<span>${ctx.ariaLabel as Signal<string>}</span>`,
        });
        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(el.querySelector('span')?.textContent).toBe('x');
        el.setAttribute('aria-label', 'updated');
        expect(el.querySelector('span')?.textContent).toBe('updated');
    });

    // An Array or Object prop is not observed, so no kebab alias carried `group-by='[…]'` to
    // `groupBy`: only `groupby` would work, and the kebab form would be dropped in silence.
    describe('the initial value of an Array/Object prop from its attribute', () => {
        function define() {
            const tag = uniqueTag();
            component(tag, {
                props: {
                    fooBar: { type: Array, default: () => [] },
                    optsMap: { type: Object, default: () => ({}) },
                },
                render: () => html`<span></span>`,
            });
            return tag;
        }

        it('reads the kebab-case attribute', () => {
            const el = document.createElement(define()) as HTMLElement & { fooBar: unknown; optsMap: unknown };
            el.setAttribute('foo-bar', '[1,2]');
            el.setAttribute('opts-map', '{"a":1}');
            document.body.appendChild(el);
            expect(el.fooBar).toEqual([1, 2]);
            expect(el.optsMap).toEqual({ a: 1 });
        });

        it('still reads the lower-case attribute, which wins when both are there', () => {
            const el = document.createElement(define()) as HTMLElement & { fooBar: unknown };
            el.setAttribute('foobar', '[1]');
            el.setAttribute('foo-bar', '[9]');
            document.body.appendChild(el);
            expect(el.fooBar).toEqual([1]);
        });

        it('a JS property set after mount still wins', () => {
            const el = document.createElement(define()) as HTMLElement & { fooBar: unknown };
            el.setAttribute('foo-bar', '[1,2]');
            document.body.appendChild(el);
            el.fooBar = [3];
            expect(el.fooBar).toEqual([3]);
        });
    });

    it('coerces Number props', () => {
        const tag = uniqueTag();
        component(tag, {
            props: {
                count: { type: Number, default: 0 },
            },
            render: (ctx) => html`<span>${() => String((ctx.count as Signal<number>)())}</span>`,
        });

        const el = document.createElement(tag);
        el.setAttribute('count', '42');
        document.body.appendChild(el);
        expect(el.querySelector('span')?.textContent).toBe('42');
    });

    it('coerces Boolean props', () => {
        const tag = uniqueTag();
        let propValue: boolean = false;

        component(tag, {
            props: {
                open: { type: Boolean, default: false },
            },
            render: (ctx) => {
                propValue = (ctx.open as Signal<boolean>).peek();
                return html`<span>test</span>`;
            },
        });

        const el = document.createElement(tag);
        el.setAttribute('open', '');
        document.body.appendChild(el);
        expect(propValue).toBe(true);
    });

    it('setup() return values are available in render', () => {
        const tag = uniqueTag();
        component(tag, {
            setup() {
                const count = signal(0);
                return {
                    count,
                    increment: () => count.set(v => v + 1),
                };
            },
            render: (ctx) => html`
                <span class="v">${ctx.count as Signal<number>}</span>
                <button @click=${ctx.increment as () => void}>+</button>
            `,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);

        expect(el.querySelector('.v')?.textContent).toBe('0');

        el.querySelector('button')!.click();
        expect(el.querySelector('.v')?.textContent).toBe('1');
    });

    it('ctx.emit() dispatches CustomEvent', () => {
        const tag = uniqueTag();
        component(tag, {
            setup(ctx) {
                return { fire: () => ctx.emit('pdx-test', { value: 42 }) };
            },
            render: (ctx) => html`<button @click=${ctx.fire as () => void}>Fire</button>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);

        let received: unknown = null;
        el.addEventListener('pdx-test', ((e: CustomEvent) => {
            received = e.detail;
        }) as EventListener);

        el.querySelector('button')!.click();
        expect(received).toEqual({ value: 42 });
    });

    it('props update reactively when attribute changes', () => {
        const tag = uniqueTag();
        component(tag, {
            props: {
                label: { type: String, default: '' },
            },
            render: (ctx) => html`<span>${ctx.label as Signal<string>}</span>`,
        });

        const el = document.createElement(tag);
        el.setAttribute('label', 'initial');
        document.body.appendChild(el);
        expect(el.querySelector('span')?.textContent).toBe('initial');

        el.setAttribute('label', 'updated');
        expect(el.querySelector('span')?.textContent).toBe('updated');
    });

    it('ctx.el references the host element', () => {
        const tag = uniqueTag();
        let hostEl: HTMLElement | null = null;

        component(tag, {
            setup(ctx) {
                hostEl = ctx.el;
            },
            render: () => html`<span>test</span>`,
        });

        const el = document.createElement(tag);
        document.body.appendChild(el);
        expect(hostEl).toBe(el);
    });
});

// ─── Prop persistence across a re-parent + boolean removeAttribute semantics ───

describe('prop persistence across disconnect/reconnect', () => {
    it('a default-true boolean set to false stays false after the re-parent', () => {
        const tag = uniqueTag();
        component(tag, {
            props: { flag: { type: Boolean, default: true } },
            render: () => html`<span></span>`,
        });
        const host = document.createElement('div');
        const other = document.createElement('div');
        document.body.append(host, other);

        const el = document.createElement(tag) as HTMLElement & { flag: boolean };
        host.appendChild(el);
        expect(el.flag).toBe(true);

        el.flag = false;
        expect(el.flag).toBe(false);

        // Re-parent (the drawer's pattern): disconnect (destroy mode) + reconnect
        other.appendChild(el);
        expect(el.flag).toBe(false);
    });

    it('a string prop set from JS survives a re-parent', () => {
        const tag = uniqueTag();
        component(tag, {
            props: { label: { type: String, default: 'default' } },
            render: () => html`<span></span>`,
        });
        const host = document.createElement('div');
        const other = document.createElement('div');
        document.body.append(host, other);
        const el = document.createElement(tag) as HTMLElement & { label: string };
        host.appendChild(el);
        el.label = 'custom';
        other.appendChild(el);
        expect(el.label).toBe('custom');
    });
});

describe('removeAttribute semantics for a Boolean prop', () => {
    it('an attribute present and then removed → false, default true or not', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: { flag: { type: Boolean, default: true } },
            render: () => html`<span></span>`,
        });
        const el = document.createElement(tag) as HTMLElement & { flag: boolean };
        el.setAttribute('flag', '');
        document.body.appendChild(el);
        expect(el.flag).toBe(true);

        el.removeAttribute('flag');
        await Promise.resolve();
        expect(el.flag).toBe(false);
    });

    it('an attribute that was never there → the default stands', () => {
        const tag = uniqueTag();
        component(tag, {
            props: { flag: { type: Boolean, default: true } },
            render: () => html`<span></span>`,
        });
        const el = document.createElement(tag) as HTMLElement & { flag: boolean };
        document.body.appendChild(el);
        expect(el.flag).toBe(true);
    });

    it('an attribute changed after the mount updates the prop (attr→prop sync preserved)', async () => {
        const tag = uniqueTag();
        component(tag, {
            props: { count: { type: Number, default: 0 } },
            render: () => html`<span></span>`,
        });
        const el = document.createElement(tag) as HTMLElement & { count: number };
        document.body.appendChild(el);
        el.setAttribute('count', '5');
        await Promise.resolve();
        expect(el.count).toBe(5);
    });
});

// A prop named after a global attribute the browser acts on — title, hidden, lang, dir — must not
// leave that attribute on the host: `title="Revenue"` on a statistic card would be a native tooltip
// over the whole card, and a `:title` binding, written before the child connects, would go through
// HTMLElement.prototype.title and reflect to the attribute too.
describe('a prop named after a global attribute leaves no attribute on the host', () => {
    // A fixed tag name: html`` cannot interpolate one, and the binding test needs it in a template.
    component('x-global-attr-prop', {
        props: {
            title: { type: String, default: '' },
            hidden: { type: Boolean, default: false },
        },
        render: (ctx) => html`<h3>${ctx.title as Signal<string>}</h3>`,
    });
    type Host = HTMLElement & { title: string; hidden: boolean };

    beforeEach(() => { document.body.innerHTML = ''; });

    it('a static title is the prop, and the host keeps no title attribute; setAttribute later does the same', async () => {
        const el = document.createElement('x-global-attr-prop') as Host;
        el.setAttribute('title', 'Revenue');
        document.body.appendChild(el);
        expect(el.title).toBe('Revenue');
        expect(el.querySelector('h3')?.textContent).toBe('Revenue');
        expect(el.hasAttribute('title'), 'the title attribute stayed: a tooltip over the component').toBe(false);

        el.setAttribute('title', 'Orders');
        await Promise.resolve();
        expect(el.title).toBe('Orders');
        expect(el.querySelector('h3')?.textContent).toBe('Orders');
        expect(el.hasAttribute('title')).toBe(false);
    });

    it('a :title bound before the child connects is the prop, and leaves no attribute', () => {
        const frag = html`<x-global-attr-prop :title=${'Bound'}></x-global-attr-prop>`;
        document.body.appendChild(frag);
        const el = document.body.querySelector('x-global-attr-prop') as Host;
        expect(el.title).toBe('Bound');
        expect(el.hasAttribute('title')).toBe(false);
    });

    it('a Boolean prop named hidden keeps its value when the attribute is taken off', async () => {
        const el = document.createElement('x-global-attr-prop') as Host;
        el.setAttribute('hidden', '');
        document.body.appendChild(el);
        await Promise.resolve();
        expect(el.hidden, 'the removal reset the prop to false').toBe(true);
        expect(el.hasAttribute('hidden')).toBe(false);
    });
});
