// `defineComponent` carries the features it is given and no other (#1246); `component()` is it with
// every feature. A descriptor that uses a feature the definition was not given is refused in development.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineComponent, component, exposeOnElement, bindHost, FormPdxElement, PdxElement, model, slotProjection } from '../src/index';

let n = 0;
const tag = (): string => `x-features-${++n}`;
const mounted: HTMLElement[] = [];
function mount(name: string): HTMLElement {
    const el = document.createElement(name);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); });

const render = () => document.createTextNode('');

/** A render with a <slot> in a box. */
const slotted = () => {
    const box = document.createElement('div');
    box.className = 'box';
    box.append(document.createElement('slot'));
    return box;
};

/** Build the host with its children, then insert it: the order a page gives the upgrade. */
function mountWith(name: string, childrenHtml: string): HTMLElement {
    const el = document.createElement(name);
    el.innerHTML = childrenHtml;
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

describe('defineComponent: the features given, and no other (#1246)', () => {
    it('given none, the context has no expose', () => {
        let seen: Record<string, unknown> = {};
        const name = tag();
        defineComponent(name, { setup(ctx) { seen = ctx as unknown as Record<string, unknown>; }, render });
        mount(name);
        expect(typeof seen.emit).toBe('function');
        expect(seen.expose).toBeUndefined();
    });

    it('given expose, ctx.expose puts the API on the element', () => {
        const name = tag();
        defineComponent(name, {
            setup(ctx) { (ctx as unknown as { expose(api: object): void }).expose({ ping: () => 'pong' }); },
            render,
        }, { expose: exposeOnElement });
        expect((mount(name) as unknown as { ping(): string }).ping()).toBe('pong');
    });

    it('given host, the host carries its attributes and its variant axes', () => {
        const name = tag();
        defineComponent(name, { host: { role: 'note' }, variants: { tone: ['neutral', 'danger'] }, render }, { host: bindHost });
        const el = mount(name);
        expect(el.getAttribute('role')).toBe('note');
        expect(el.getAttribute('tone')).toBe('neutral');
    });

    it('refuses, in development, a host or variant axes it was not given the host feature for', () => {
        expect(() => defineComponent(tag(), { host: { role: 'note' }, render })).toThrow(/host feature/);
        expect(() => defineComponent(tag(), { variants: { tone: ['a', 'b'] }, render }, { expose: exposeOnElement })).toThrow(/host feature/);
    });

    it('given form, a form-associated component extends FormPdxElement; one that is not, PdxElement', () => {
        const formTag = tag();
        defineComponent(formTag, { models: { value: model('', { form: true }) }, render }, { form: FormPdxElement });
        const plainTag = tag();
        defineComponent(plainTag, { render }, { form: FormPdxElement });
        expect(mount(formTag)).toBeInstanceOf(FormPdxElement);
        const plain = mount(plainTag);
        expect(plain).toBeInstanceOf(PdxElement);
        expect(plain).not.toBeInstanceOf(FormPdxElement);
    });

    it('refuses, in development, a form-associated component it was not given the form feature for', () => {
        expect(() => defineComponent(tag(), { models: { value: model('', { form: true }) }, render })).toThrow(/form feature/);
        expect(() => defineComponent(tag(), { formAssociated: true, render })).toThrow(/form feature/);
    });

    it('given projection, the host\'s children go into the <slot> its template renders', () => {
        const name = tag();
        defineComponent(name, { render: slotted }, { projection: slotProjection });
        const el = mountWith(name, '<p>child</p>');
        expect(el.querySelector('.box > p')?.textContent).toBe('child');
        expect(el.querySelector('slot'), 'the placeholder was left').toBeNull();
    });

    it('without it, they are not placed in the slot, and development says so', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const name = tag();
            defineComponent(name, { render: slotted });
            const el = mountWith(name, '<p>child</p>');
            expect(el.querySelector('p'), 'the child was projected without the feature').toBeNull();
            expect(warn.mock.calls.some((c) => String(c[0]).includes(name) && String(c[0]).includes('slot projection'))).toBe(true);
        } finally {
            warn.mockRestore();
        }
    });

    it('component() is defineComponent with every feature', () => {
        let seen: Record<string, unknown> = {};
        const name = tag();
        component(name, { host: { role: 'note' }, setup(ctx) { seen = ctx as unknown as Record<string, unknown>; }, render });
        const el = mount(name);
        expect(el.getAttribute('role')).toBe('note');
        expect(typeof seen.expose).toBe('function');
    });
});
