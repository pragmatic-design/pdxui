// A model is a prop the component may write (#124): `models: { value: model<string>('') }`. Writing
// it inside the component sets the prop and dispatches `value-change` with `{ value }`; the parent
// binds it with `::value`, which listens to that event and to nothing else.

import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { prop, event, model } from '../src/component/component-descriptor';
import { html } from '../src/renderer/template';
import { signal } from '../src/reactivity/signal';
import type { Signal } from '../src/utils/types';

let seq = 0;
const tag = () => `x-model-${++seq}`;
const mounted: Element[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); vi.restoreAllMocks(); });
function mount<T extends HTMLElement>(name: string, attrs: Record<string, string> = {}): T {
    const el = document.createElement(name) as T;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

type Host = HTMLElement & { value: string; write(v: string): void };

/** A component with a `value` model and a method that writes it from inside. */
function defineField(name: string, events?: Record<string, ReturnType<typeof event>>): void {
    component(name, {
        props: { label: prop('') },
        models: { value: model<string>('') },
        ...(events ? { events } : {}),
        setup(ctx) {
            ctx.expose({ write: (v: string) => ctx.value.set(v) });
        },
        render: () => html`<p>x</p>`,
    });
}

describe('a model', () => {
    it('is typed on the context as the signal of its type', () => {
        component(tag(), {
            models: { value: model<string>(''), count: model(0) },
            setup(ctx) {
                expectTypeOf(ctx.value).toEqualTypeOf<Signal<string>>();
                expectTypeOf(ctx.count).toEqualTypeOf<Signal<number>>();
            },
            render: () => html`<p>x</p>`,
        });
    });

    it('reads its attribute and its property as a prop does', () => {
        const name = tag();
        defineField(name);
        const el = mount<Host>(name, { value: 'from markup' });
        expect(el.value).toBe('from markup');
        el.value = 'from a property';
        expect(el.value).toBe('from a property');
    });

    it('written inside the component, sets the prop and dispatches <name>-change with { value }, not bubbling', () => {
        const name = tag();
        defineField(name);
        const el = mount<Host>(name);
        const seen: CustomEvent[] = [];
        el.addEventListener('value-change', (e) => seen.push(e as CustomEvent));
        const above = vi.fn();
        document.body.addEventListener('value-change', above);
        el.write('Ada');
        document.body.removeEventListener('value-change', above);
        expect(el.value).toBe('Ada');
        expect(seen.map(e => e.detail)).toEqual([{ value: 'Ada' }]);
        expect(above, 'the model event does not bubble').not.toHaveBeenCalled();
    });

    it('dispatches nothing when the parent sets it, or when the value does not change', () => {
        const name = tag();
        defineField(name);
        const el = mount<Host>(name);
        const seen = vi.fn();
        el.addEventListener('value-change', seen);
        el.value = 'set by the parent';
        el.write('set by the parent');
        expect(seen).not.toHaveBeenCalled();
    });

    it('names its event in kebab-case: selectedId → selected-id-change', () => {
        const name = tag();
        component(name, {
            models: { selectedId: model<string>('') },
            setup(ctx) { ctx.expose({ pick: (v: string) => ctx.selectedId.set(v) }); },
            render: () => html`<p>x</p>`,
        });
        const el = mount<HTMLElement & { pick(v: string): void }>(name);
        const seen: unknown[] = [];
        el.addEventListener('selected-id-change', (e) => seen.push((e as CustomEvent).detail));
        el.pick('a');
        expect(seen).toEqual([{ value: 'a' }]);
    });

    it('counts as declared beside the descriptor\'s events: no warning for its event', () => {
        const name = tag();
        defineField(name, { saved: event<void>() });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        mount<Host>(name).write('x');
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('::name on a model', () => {
    it('round-trips: the signal sets the model, the component\'s write sets the signal', () => {
        const name = tag();
        defineField(name);
        const sig = signal('start');
        // `html` takes a static tag: the strings are built with the generated tag inlined.
        const host = document.createElement('div');
        host.append(html([`<${name} ::value=`, `></${name}>`] as unknown as TemplateStringsArray, sig));
        document.body.appendChild(host);
        mounted.push(host);
        const el = host.querySelector(name) as Host;
        expect(el.value).toBe('start');
        sig.set('from the parent');
        expect(el.value).toBe('from the parent');
        el.write('from the child');
        expect(sig()).toBe('from the child');
    });

    it('listens to the model\'s event only: a pdx-change from the component does not write the signal', () => {
        const name = tag();
        defineField(name);
        const sig = signal('start');
        const host = document.createElement('div');
        host.append(html([`<${name} ::value=`, `></${name}>`] as unknown as TemplateStringsArray, sig));
        document.body.appendChild(host);
        mounted.push(host);
        const el = host.querySelector(name) as Host;
        el.dispatchEvent(new CustomEvent('pdx-change', { detail: { value: 'not the model' } }));
        expect(sig()).toBe('start');
    });

    it('.lazy writes the signal on the native change, the commit, and not on each write of the model (#479)', () => {
        const name = tag();
        defineField(name);
        const sig = signal('start');
        const host = document.createElement('div');
        host.append(html([`<${name} ::value.lazy=`, `></${name}>`] as unknown as TemplateStringsArray, sig));
        document.body.appendChild(host);
        mounted.push(host);
        const el = host.querySelector(name) as Host;
        el.write('typing');
        expect(sig(), 'a live write is not the commit').toBe('start');
        // The inner input's change, bubbling to the host: the property is what the signal gets.
        el.querySelector('p')!.dispatchEvent(new Event('change', { bubbles: true }));
        expect(sig()).toBe('typing');
    });
});
