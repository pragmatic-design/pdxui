// The typed component descriptor (#123): a TypeScript component declares props and events with the
// same meaning as a .pdx's runes, and its context is typed from the declaration.

import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { prop, event, model, slot } from '../src/component/component-descriptor';
import { html } from '../src/renderer/template';
import type { Signal } from '../src/utils/types';

let seq = 0;
const tag = () => `x-descriptor-${++seq}`;
const mounted: HTMLElement[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); vi.restoreAllMocks(); });
function mount<T extends HTMLElement>(name: string, attrs: Record<string, string> = {}): T {
    const el = document.createElement(name) as T;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

interface Option { value: string; label: string }

describe('the descriptor\'s types', () => {
    it('types ctx from props and emit from events', () => {
        const name = tag();
        component(name, {
            props: {
                size: prop<'sm' | 'md' | 'lg'>('md'),
                options: prop.required<Option[]>(),
                count: prop(0),
            },
            events: {
                open: event<void>(),
                change: event<string>(),
            },
            models: { value: model<string>('') },
            slots: { item: slot<(o: Option) => Node>() },
            states: ['open'],
            parts: ['trigger', 'popup'],
            expose: ['open', 'close'],
            host: { role: 'combobox' },
            variants: { variant: ['primary', 'ghost'] },
            setup(ctx) {
                expectTypeOf(ctx.size).toEqualTypeOf<Signal<'sm' | 'md' | 'lg'>>();
                expectTypeOf(ctx.options).toEqualTypeOf<Signal<Option[]>>();
                expectTypeOf(ctx.count).toEqualTypeOf<Signal<number>>();
                // A declared void event takes no detail; a typed one takes its type.
                const typed = (): void => {
                    ctx.emit('open');
                    ctx.emit('change', 'x');
                    // @ts-expect-error — not a declared event
                    ctx.emit('nope');
                    // @ts-expect-error — the detail of 'change' is a string
                    ctx.emit('change', 1);
                };
                void typed;
            },
            render: () => html`<p>x</p>`,
        });
        expect(customElements.get(name)).toBeDefined();
    });

    it('with no events declared, emit takes any name, as it always has', () => {
        component(tag(), {
            props: { label: prop('') },
            setup(ctx) {
                const any = (): boolean => ctx.emit('whatever', { a: 1 });
                void any;
            },
            render: () => html`<p>x</p>`,
        });
    });
});

describe('the descriptor at runtime', () => {
    it('a prop() reads its attribute coerced by the type its default implies', () => {
        const name = tag();
        let seen: unknown[] = [];
        component(name, {
            props: { size: prop<'sm' | 'md'>('md'), count: prop(0), on: prop(false) },
            setup(ctx) { seen = [ctx.size(), ctx.count(), ctx.on()]; },
            render: () => html`<p>x</p>`,
        });
        mount(name, { size: 'sm', count: '3', on: '' });
        expect(seen).toEqual(['sm', 3, true]);
    });

    it('a prop with no default takes its declared type: { type: Number }', () => {
        const name = tag();
        let seen: unknown;
        component(name, {
            props: { max: prop.required<number>({ type: Number }) },
            setup(ctx) { seen = ctx.max(); },
            render: () => html`<p>x</p>`,
        });
        mount(name, { max: '7' });
        expect(seen).toBe(7);
    });

    it('an array default given as a factory is fresh for each instance', () => {
        const name = tag();
        const lists: unknown[] = [];
        component(name, {
            props: { items: prop<string[]>(() => []) },
            setup(ctx) { lists.push(ctx.items()); },
            render: () => html`<p>x</p>`,
        });
        mount(name);
        mount(name);
        expect(lists[0]).toEqual([]);
        expect(lists[0]).not.toBe(lists[1]);
    });

    it('a required prop the host does not set is reported in development', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const name = tag();
        component(name, { props: { options: prop.required<Option[]>() }, render: () => html`<p>x</p>` });
        mount(name);
        expect(warn.mock.calls.flat().join(' ')).toContain(`<${name}> mounted without its required prop 'options'`);
    });

    it('the control: a required prop that is set is not reported', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const name = tag();
        component(name, { props: { label: prop.required<string>({ type: String }) }, render: () => html`<p>x</p>` });
        mount(name, { label: 'a' });
        expect(warn.mock.calls.flat().join(' ')).not.toContain('required prop');
    });

    it('an optional prop (#130) the host does not set holds its type\'s empty value, and is not reported', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const name = tag();
        let seen: unknown = 'unread';
        component(name, { props: { hint: prop.optional<string>({ type: String }) }, setup(ctx) { seen = ctx.hint(); }, render: () => html`<p>x</p>` });
        mount(name);
        expect(seen).toBe('');
        expect(warn.mock.calls.flat().join(' ')).not.toContain('required prop');
        expect(prop.optional<number[]>()).toEqual({ type: Object });
    });

    it('emitting an event the descriptor does not declare is reported, and still dispatched', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const name = tag();
        let fire: (n: string) => void = () => {};
        component(name, {
            events: { open: event<void>() },
            setup(ctx) { fire = (n) => { (ctx.emit as (e: string) => boolean)(n); }; },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        const got: string[] = [];
        el.addEventListener('other', () => got.push('other'));
        fire('other');
        expect(got).toEqual(['other']);
        expect(warn.mock.calls.flat().join(' ')).toContain(`emitted 'other', which its descriptor does not declare`);
    });

    it('an event declared with bubbles: false does not bubble', () => {
        const name = tag();
        let fire: () => void = () => {};
        component(name, {
            events: { done: event<number>({ bubbles: false }), up: event<void>() },
            setup(ctx) { fire = () => { ctx.emit('done', 1); ctx.emit('up'); }; },
            render: () => html`<p>x</p>`,
        });
        const el = mount(name);
        const seenAbove: string[] = [];
        document.body.addEventListener('done', () => seenAbove.push('done'), { once: true });
        document.body.addEventListener('up', () => seenAbove.push('up'), { once: true });
        const onEl: unknown[] = [];
        el.addEventListener('done', (e) => onEl.push((e as CustomEvent).detail));
        fire();
        expect(onEl).toEqual([1]);
        expect(seenAbove).toEqual(['up']);
    });
});
