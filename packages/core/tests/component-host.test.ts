// The host's attributes, bindings and listeners, declared (#133): `host` in the descriptor, which a
// `.pdx` `@host { … }` compiles into.

import { describe, it, expect, afterEach } from 'vitest';
import { component } from '../src/component/component';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { tick } from '../src/testing';

let seq = 0;
const tag = () => `x-host-${++seq}`;
const mounted: HTMLElement[] = [];
afterEach(() => { for (const el of mounted.splice(0)) el.remove(); });

function mount(name: string, attrs: Record<string, string> = {}): HTMLElement {
    const el = document.createElement(name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    mounted.push(el);
    return el;
}

/** A combobox host: a static role, an aria-expanded bound to `open`, Enter toggling it. */
function combobox(): { name: string; keys: string[] } {
    const name = tag();
    const keys: string[] = [];
    component(name, {
        setup() {
            const open = signal(false);
            return { open, toggle: (e: KeyboardEvent) => { keys.push(e.key); open.set(v => !v); } };
        },
        host: {
            role: 'combobox',
            tabindex: '0',
            ':aria-expanded': (ctx) => (ctx.open() ? 'true' : 'false'),
            '@keydown.enter': (ctx, e) => ctx.toggle(e as KeyboardEvent),
        },
        render: () => html`<span>x</span>`,
    });
    return { name, keys };
}

const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

describe('a descriptor\'s host', () => {
    it('sets its static attributes on the element', () => {
        const el = mount(combobox().name);
        expect(el.getAttribute('role')).toBe('combobox');
        expect(el.getAttribute('tabindex')).toBe('0');
    });

    it('a bound attribute follows what it reads, and a listener on the host calls its handler', async () => {
        const { name, keys } = combobox();
        const el = mount(name);
        expect(el.getAttribute('aria-expanded')).toBe('false');
        key(el, 'Enter');
        await tick();
        expect(keys).toEqual(['Enter']);
        expect(el.getAttribute('aria-expanded')).toBe('true');
    });

    it('a listener keeps the template\'s modifiers: .enter ignores other keys', async () => {
        const { name, keys } = combobox();
        const el = mount(name);
        key(el, 'a');
        await tick();
        expect(keys).toEqual([]);
        expect(el.getAttribute('aria-expanded')).toBe('false');
    });

    it('a static attribute the page already set is the page\'s: it is not overwritten', () => {
        const el = mount(combobox().name, { role: 'listbox', tabindex: '-1' });
        expect(el.getAttribute('role')).toBe('listbox');
        expect(el.getAttribute('tabindex')).toBe('-1');
    });

    it('a disconnected host stops listening, and listens once again when it comes back', async () => {
        const { name, keys } = combobox();
        const el = mount(name);
        el.remove();
        key(el, 'Enter');
        document.body.appendChild(el);
        await tick();
        key(el, 'Enter');
        await tick();
        expect(keys).toEqual(['Enter']);
    });

    it('the control: a component with no host leaves its element alone', () => {
        const name = tag();
        component(name, { render: () => html`<span>x</span>` });
        const el = mount(name);
        expect(el.hasAttribute('role')).toBe(false);
    });
});
