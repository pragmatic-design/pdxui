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

describe("a host's :class and :style, read as the template's (#1242)", () => {
    type Ctx = { on: () => boolean; width: () => string | null; words: () => string };
    /** A host whose :class or :style follows `on`, `width` and `words`. */
    function styled(host: Record<string, (ctx: Ctx) => unknown>) {
        const name = tag();
        const on = signal(false);
        const width = signal<string | null>('10px');
        const words = signal('a b');
        component(name, { setup: () => ({ on, width, words }), host: host as never, render: () => html`<span>x</span>` });
        return { name, on, width, words };
    }

    it("the object form of :class toggles each class and keeps the author's", async () => {
        const { name, on } = styled({ ':class': (ctx) => ({ active: ctx.on(), 'pdx-off': !ctx.on() }) });
        const el = mount(name, { class: 'toolbar' });
        expect([...el.classList].sort()).toEqual(['pdx-off', 'toolbar']);
        on.set(true);
        await tick();
        expect([...el.classList].sort()).toEqual(['active', 'toolbar']);
        on.set(false);
        await tick();
        expect([...el.classList].sort()).toEqual(['pdx-off', 'toolbar']);
    });

    it("the string form of :class removes only the classes it named last, never the author's", async () => {
        const { name, words } = styled({ ':class': (ctx) => ctx.words() });
        const el = mount(name, { class: 'toolbar' });
        expect([...el.classList].sort()).toEqual(['a', 'b', 'toolbar']);
        words.set('b c');
        await tick();
        expect([...el.classList].sort()).toEqual(['b', 'c', 'toolbar']);
        words.set('');
        await tick();
        expect([...el.classList]).toEqual(['toolbar']);
    });

    it("the object form of :style sets and clears its property, and keeps the author's inline style", async () => {
        const { name, width } = styled({ ':style': (ctx) => ({ width: ctx.width(), marginTop: '2px' }) });
        const el = mount(name, { style: 'color: red' });
        expect(el.style.width).toBe('10px');
        expect(el.style.marginTop, 'a camelCase key is its kebab-case property').toBe('2px');
        expect(el.style.color).toBe('red');
        width.set(null);
        await tick();
        expect(el.style.width).toBe('');
        expect(el.style.color, "the author's").toBe('red');
    });

    it('the string form of :style writes style.cssText, null as empty (#1240)', async () => {
        const { name, width } = styled({ ':style': (ctx) => (ctx.width() === null ? null : `width: ${ctx.width()}`) });
        const el = mount(name);
        expect(el.style.width).toBe('10px');
        width.set(null);
        await tick();
        expect(el.style.cssText).toBe('');
    });
});
