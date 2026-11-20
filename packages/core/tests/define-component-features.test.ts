// `defineComponent` carries the features it is given and no other (#1246); `component()` is it with
// every feature. A descriptor that uses a feature the definition was not given is refused in development.

import { describe, it, expect, afterEach } from 'vitest';
import { defineComponent, component, exposeOnElement, bindHost } from '../src/index';

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

    it('component() is defineComponent with every feature', () => {
        let seen: Record<string, unknown> = {};
        const name = tag();
        component(name, { host: { role: 'note' }, setup(ctx) { seen = ctx as unknown as Record<string, unknown>; }, render });
        const el = mount(name);
        expect(el.getAttribute('role')).toBe('note');
        expect(typeof seen.expose).toBe('function');
    });
});
