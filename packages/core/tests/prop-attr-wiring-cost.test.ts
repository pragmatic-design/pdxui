// What a component's mount costs per prop (src/component/component.ts, element.ts).
//
// Each observed attribute had a signal made in the element's constructor, and each prop an effect
// in body() that copied that signal into the prop's: per mount, one signal and one effect per prop
// besides the prop's own signal, fifteen of each for a component with fifteen props. The attribute
// now reaches the prop by a call from attributeChangedCallback, as a property set reaches it by the
// setter: a prop costs its signal.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as reactivity from '../src/reactivity/signal';

const made = { signals: 0, effects: 0 };
vi.mock('../src/reactivity/signal', async (importOriginal) => {
    const actual = await importOriginal<typeof reactivity>();
    return {
        ...actual,
        signal: (...args: Parameters<typeof actual.signal>) => { made.signals++; return actual.signal(...args); },
        effect: (...args: Parameters<typeof actual.effect>) => { made.effects++; return actual.effect(...args); },
    };
});

const { component, prop } = await import('../src/index');

beforeEach(() => { document.body.innerHTML = ''; });

const TEN = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, prop('x')]));
component('x-wiring-none', { render: () => document.createDocumentFragment() });
component('x-wiring-ten', { props: TEN, render: () => document.createDocumentFragment() });

/** The signals and effects one element of `tag` makes, from its constructor to its mount. */
function mountCost(tag: string): { signals: number; effects: number } {
    made.signals = 0;
    made.effects = 0;
    const el = document.createElement(tag);
    document.body.appendChild(el);
    return { ...made };
}

describe('the mount of a component, per prop', () => {
    it('makes the prop its signal, and no effect', () => {
        const none = mountCost('x-wiring-none');
        const ten = mountCost('x-wiring-ten');
        expect(ten.effects - none.effects).toBe(0);
        expect(ten.signals - none.signals).toBe(10);
    });

    it('still takes an attribute change, and an alias of the attribute', () => {
        component('x-wiring-alias', { props: { maxLength: prop(0), label: prop('') }, render: () => document.createDocumentFragment() });
        const el = document.createElement('x-wiring-alias') as HTMLElement & { maxLength: number; label: string };
        el.setAttribute('max-length', '3');
        document.body.appendChild(el);
        expect(el.maxLength).toBe(3);
        el.setAttribute('maxlength', '5');
        expect(el.maxLength).toBe(5);
        el.setAttribute('max-length', '7');
        expect(el.maxLength).toBe(7);
        el.setAttribute('label', 'a');
        expect(el.label).toBe('a');
        el.removeAttribute('label');
        expect(el.label).toBe('');
    });

    it('stops taking attribute changes once the component is destroyed, as its effect did', () => {
        component('x-wiring-gone', { props: { label: prop('') }, render: () => document.createDocumentFragment() });
        const el = document.createElement('x-wiring-gone') as HTMLElement & { label: string };
        el.setAttribute('label', 'a');
        document.body.appendChild(el);
        el.remove();
        el.setAttribute('label', 'b');
        expect(el.label).toBe('a');
    });
});
