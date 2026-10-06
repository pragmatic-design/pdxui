// A URL bound to an attribute is sanitised whether it lands as an attribute or as a property.
//
// `bindProperty` decides first whether a binding is an attribute or a property: on a plain element,
// a name the element has no property for is an attribute. A URL check on the property side alone
// misses it: `xlink:href` is a property of no element, so `:xlink:href="javascript:alert(1)"` on an
// SVG `<a>` would go through `setAttribute` untouched — a link a click runs. The same holds for any
// URL name on an element that lacks it, such as `formaction` on a div.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';

const BAD = 'javascript:alert(1)';

afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
});

function svgLink(frag: DocumentFragment | Node): Element {
    document.body.appendChild(frag);
    return document.body.querySelector('svg a')!;
}

describe('an URL attribute with no DOM property is sanitised', () => {
    it(':xlink:href on an SVG link drops javascript: (static)', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const a = svgLink(html`<svg><a :xlink:href=${BAD}><text>x</text></a></svg>`);
        expect(a.getAttribute('xlink:href')).toBeNull();
    });

    it(':xlink:href on an SVG link drops javascript: (reactive), and takes a safe value back', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const url = signal(BAD);
        const a = svgLink(html`<svg><a :xlink:href=${() => url()}><text>x</text></a></svg>`);
        expect(a.getAttribute('xlink:href')).toBeNull();

        url.set('#target');
        expect(a.getAttribute('xlink:href')).toBe('#target');

        url.set(BAD);
        expect(a.getAttribute('xlink:href')).toBeNull();
    });

    it('a URL name on an element without that property is dropped too', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        document.body.appendChild(html`<div :formaction=${BAD}></div>`);
        expect(document.body.querySelector('div')!.getAttribute('formaction')).toBeNull();
    });

    it('the drop is reported in dev, like on the property side', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        svgLink(html`<svg><a :xlink:href=${BAD}><text>x</text></a></svg>`);
        const messages = warn.mock.calls.map(c => String(c[0]));
        expect(messages.some(m => m.includes('xlink:href') && m.includes('javascript:'))).toBe(true);
    });
});

describe('the controls', () => {
    it('a safe :xlink:href is kept', () => {
        const a = svgLink(html`<svg><a :xlink:href=${'#target'}><text>x</text></a></svg>`);
        expect(a.getAttribute('xlink:href')).toBe('#target');
    });

    it('data-* is not a URL: its value is left alone', () => {
        document.body.appendChild(html`<div :data-url=${BAD}></div>`);
        expect(document.body.querySelector('div')!.getAttribute('data-url')).toBe(BAD);
    });

    it('an ordinary attribute with no property is still set as given', () => {
        document.body.appendChild(html`<div :itemprop=${'name'}></div>`);
        expect(document.body.querySelector('div')!.getAttribute('itemprop')).toBe('name');
    });
});

describe(':href on an SVG link', () => {
    it('drops javascript:, and keeps a fragment', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const bad = svgLink(html`<svg><a :href=${BAD}><text>x</text></a></svg>`);
        expect(bad.getAttribute('href')).toBeNull();

        document.body.innerHTML = '';
        const ok = svgLink(html`<svg><a :href=${'#target'}><text>x</text></a></svg>`);
        expect(ok.getAttribute('href')).toBe('#target');
    });
});
