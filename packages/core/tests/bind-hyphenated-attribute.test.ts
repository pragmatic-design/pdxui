// A bound attribute with a hyphen in its name has to reach the DOM.
//
// Deciding between attribute and property by the name alone:
//
//     const useAttr = prop.startsWith('aria-') || prop.startsWith('data-');
//     const resolved = useAttr ? prop : (ATTR_TO_PROP[prop] ?? kebabToCamel(prop));
//
// turns `:pdx-theme="t"` on a <div> into `el.pdxTheme = 'material'` — a JavaScript property on a
// plain element. Invisible in the DOM, matched by no CSS selector, and logged nowhere: of
// `:pdx-theme :data-probe :aria-label :pdx-scheme`, only the middle two would land.
//
// "All other kebab-case names are camelCase props normalized by the compiler" is true of a CUSTOM
// ELEMENT, which declares those props. It is false of a plain element, where a hyphenated name can
// only ever be an attribute — a hyphen cannot appear in a JavaScript identifier.
//
// So the discriminator is the element, not the name. Deliberately NOT `camel in el`: bindings are
// applied when the template is instantiated, which can be before a custom element has upgraded, so
// asking whether the property exists would answer "no" for a component that does declare it and
// stringify an object into an attribute. Asking whether the tag is a custom element is a fact that
// does not depend on timing.

import { describe, it, expect, beforeEach } from 'vitest';
import { html } from '../src/renderer/template';
import { signal } from '../src/reactivity/signal';

/** Mount a fragment and hand back the first element in it. */
function mount(frag: Node): HTMLElement {
    const host = document.createElement('div');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host.firstElementChild as HTMLElement;
}

/** A component that DECLARES a hyphen-derived prop, which is the case that must not regress. */
class Declaring extends HTMLElement {
    renderSlide: unknown;
    someThing: unknown;
}
customElements.define('bind-declaring', Declaring);

beforeEach(() => { document.body.innerHTML = ''; });

describe('a hyphenated binding on a plain element', () => {
    it('lands as an attribute, whatever the prefix', () => {
        const el = mount(html`<div
            :pdx-theme=${'material'}
            :pdx-scheme=${'dark'}
            :data-probe=${'x'}
            :aria-label=${'y'}
            :itemprop=${'z'}></div>` as Node);

        const attrs = Object.fromEntries(Array.from(el.attributes).map(a => [a.name, a.value]));
        expect(attrs, 'a hyphenated binding was set as a JS property and vanished').toEqual({
            'pdx-theme': 'material',
            'pdx-scheme': 'dark',
            'data-probe': 'x',
            'aria-label': 'y',
            itemprop: 'z',
        });
    });

    it('is the attribute a CSS selector can match, which is the point', () => {
        // The failure is invisible precisely because nothing selects it. Assert the effect, not
        // only the presence.
        const el = mount(html`<div :pdx-theme=${'cyberpunk'}></div>` as Node);
        expect(el.matches('[pdx-theme="cyberpunk"]'), 'the attribute is there but does not match').toBe(true);
    });

    it('follows a signal, and removes itself when the value goes away', () => {
        const theme = signal<string | null>('glass');
        const el = mount(html`<div :pdx-theme=${() => theme()}></div>` as Node);
        expect(el.getAttribute('pdx-theme')).toBe('glass');

        theme.set('metro');
        expect(el.getAttribute('pdx-theme'), 'the binding is not reactive').toBe('metro');

        theme.set(null);
        expect(el.hasAttribute('pdx-theme'), 'null must remove the attribute, not write "null"').toBe(false);
    });
});

describe('a hyphenated binding on a custom element', () => {
    it('still arrives as a property, so component props do not regress', () => {
        // Wrapped in a getter, which is how the compiler emits a function prop: the engine treats a
        // bare function value as a reactive getter and CALLS it, so `:render-slide=${fn}` would
        // deliver fn's return value. That is deliberate behaviour, and part of the contract.
        const fn = (): string => 'slide';
        const el = mount(html`<bind-declaring :render-slide=${() => fn}></bind-declaring>` as Node);

        expect((el as Declaring).renderSlide, 'a function prop stopped reaching the component').toBe(fn);
        expect(el.hasAttribute('render-slide'), 'a function was written into an attribute').toBe(false);
    });

    it('does not stringify an object into an attribute', () => {
        // This is what the attribute rule must not break: `[object Object]` in an attribute is how a data-driven
        // component silently receives nothing.
        const value = { rows: [1, 2, 3] };
        const el = mount(html`<bind-declaring :some-thing=${value}></bind-declaring>` as Node);

        expect((el as Declaring).someThing, 'the object prop was lost').toBe(value);
        expect(el.getAttribute('some-thing'), 'the object was stringified into an attribute').toBeNull();
    });

    it('reaches a component that has NOT upgraded yet', () => {
        // Bindings run when the template is instantiated, which can precede the auto-import that
        // defines the element. `camel in el` would answer "no" here and send an object to an
        // attribute, which is why the discriminator is the tag rather than the property.
        const value = { rows: [4, 5] };
        const el = mount(html`<bind-not-yet-defined :some-thing=${value}></bind-not-yet-defined>` as Node);

        expect((el as unknown as { someThing?: unknown }).someThing, 'the prop was lost before upgrade').toBe(value);
        expect(el.getAttribute('some-thing')).toBeNull();
    });
});
