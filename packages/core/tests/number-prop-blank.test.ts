// A blank string handed to a Number prop means "none given", and takes the prop's declared default.
//
// Number('') is 0, so a plain coercion would make `<pdx-number-input value="">`, and `el.value = ''`,
// arrive as 0 — a number nobody entered, in a field whose empty state is null. The platform treats
// a blank numeric attribute as absent (`<input maxlength="">` has no limit), and so does this:
// the attribute, a later attribute change and a string property all go through the same rule.

import { describe, it, expect, beforeEach } from 'vitest';
import { component } from '../src/component/component';
import type { PropDefinition } from '../src/component/component';
import { html } from '../src/renderer/template';

let tagId = 0;

/** Define a component with one Number prop and hand back the element and a reader for the prop. */
function mount(def: PropDefinition, attrs: Record<string, string> = {}): { el: HTMLElement; read: () => unknown } {
    const tag = `number-blank-${tagId++}`;
    let read: () => unknown = () => Symbol('never read');
    component(tag, {
        props: { n: def },
        setup(ctx) { read = () => (ctx as unknown as { n: () => unknown }).n(); },
        render: () => html`<i></i>`,
    });
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.body.appendChild(el);
    return { el, read };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('a blank string for a Number prop takes the declared default', () => {
    it('an initial blank attribute: the declared null, not 0', () => {
        expect(mount({ type: Number, default: null }, { n: '' }).read()).toBeNull();
    });

    it('an initial blank attribute: a declared number default, not 0', () => {
        expect(mount({ type: Number, default: 7 }, { n: '' }).read()).toBe(7);
    });

    it('a whitespace-only attribute is blank too', () => {
        expect(mount({ type: Number, default: 7 }, { n: '  ' }).read()).toBe(7);
    });

    it('an attribute changed to blank after mount', () => {
        const { el, read } = mount({ type: Number, default: null }, { n: '5' });
        expect(read()).toBe(5);
        el.setAttribute('n', '');
        expect(read()).toBeNull();
    });

    it('a blank string set as the property', () => {
        const { el, read } = mount({ type: Number, default: null });
        (el as unknown as { n: unknown }).n = 5;
        (el as unknown as { n: unknown }).n = '';
        expect(read()).toBeNull();
    });

    it('the control: "0" is zero, "3" is three, a numeric string property is a number', () => {
        expect(mount({ type: Number, default: 7 }, { n: '0' }).read()).toBe(0);
        expect(mount({ type: Number, default: 7 }, { n: '3' }).read()).toBe(3);
        const { el, read } = mount({ type: Number, default: 7 });
        (el as unknown as { n: unknown }).n = '4';
        expect(read()).toBe(4);
    });
});
