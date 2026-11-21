// Core's binding of a plain element's attribute or property with its `once` flag (#1270): what a
// compiled template calls for a value that cannot change — a literal, a @for row's key, an instance
// constant — or a `:name.once`. It is given the value itself (a `.once` read through `untracked` by the
// compiled code) and writes it by the binding's own write, with no effect: on every value, HTML and SVG,
// it leaves the element as the binding of that value does.

import { describe, it, expect } from 'vitest';
import { bindAttribute, bindNativeProperty, bindAttributeOrProperty, bindStyleText } from '../src/renderer/bound-attribute';
import { signal, effect, untracked } from '../src/reactivity/signal';

const VALUES: unknown[] = ['x', '', 3, 0, true, false, null, undefined];
const SVG = 'http://www.w3.org/2000/svg';

/** An element of `tag`, HTML or SVG. */
const make = (svg: boolean, tag: string): Element => (svg ? document.createElementNS(SVG, tag) : document.createElement(tag));
/** The attribute, the property and the inline style the comparison reads. */
const state = (el: Element, attr: string, prop?: string) => ({
    attribute: el.getAttribute(attr),
    property: prop ? (el as unknown as Record<string, unknown>)[prop] : undefined,
    style: (el as HTMLElement).style?.cssText,
});

describe('a value written once leaves the element as its binding does (#1270)', () => {
    for (const svg of [false, true]) {
        for (const value of VALUES) {
            const label = `${svg ? 'SVG' : 'HTML'}, ${JSON.stringify(value) ?? 'undefined'}`;

            it(`bindAttribute, ${label}`, () => {
                const [a, b] = [make(svg, 'g'), make(svg, 'g')];
                bindAttribute(a, 'aria-label', () => value);
                bindAttribute(b, 'aria-label', value, 1);
                expect(state(b, 'aria-label')).toEqual(state(a, 'aria-label'));
            });

            it(`bindAttributeOrProperty, ${label}`, () => {
                // `title` is a property of an HTML element, and only an attribute of an SVG <g>.
                const [a, b] = [make(svg, 'g'), make(svg, 'g')];
                bindAttributeOrProperty(a, 'title', 'title', () => value);
                bindAttributeOrProperty(b, 'title', 'title', value, 1);
                expect(state(b, 'title', 'title')).toEqual(state(a, 'title', 'title'));
            });

            it(`bindStyleText, ${label}`, () => {
                const text = typeof value === 'string' && value ? 'color: red' : value;
                const [a, b] = [make(svg, 'g'), make(svg, 'g')];
                bindStyleText(a, () => text);
                bindStyleText(b, text, 1);
                expect(state(b, 'style')).toEqual(state(a, 'style'));
            });
        }
    }

    for (const value of [true, false, null, undefined]) {
        it(`bindNativeProperty, an <input>'s disabled, ${JSON.stringify(value) ?? 'undefined'}`, () => {
            const [a, b] = [document.createElement('input'), document.createElement('input')];
            bindNativeProperty(a, 'disabled', 'disabled', () => value);
            bindNativeProperty(b, 'disabled', 'disabled', value, 1);
            expect(state(b, 'disabled', 'disabled')).toEqual(state(a, 'disabled', 'disabled'));
        });
    }
});

describe('with the once flag, the argument is the value (#1270)', () => {
    it('a function value is written as it is, not called as a getter', () => {
        const el = document.createElement('div');
        const handler = (): string => 'called';
        bindAttributeOrProperty(el, 'onclick', 'onclick', handler, 1);
        expect((el as unknown as { onclick: unknown }).onclick).toBe(handler);
    });

    it('nothing is subscribed: a signal the caller read before is not followed', () => {
        const el = document.createElement('div');
        const v = signal('a');
        let renders = 0;
        // The render a block runs in, reading the value as the compiled code does for a `.once`.
        effect(() => { renders++; bindAttribute(el, 'aria-label', untracked(() => v()), 1); });
        v.set('b');
        expect(renders).toBe(1);
        expect(el.getAttribute('aria-label')).toBe('a');
    });

    it('control: without the flag, the binding follows the signal', () => {
        const el = document.createElement('div');
        const v = signal('a');
        bindAttribute(el, 'aria-label', () => v());
        v.set('b');
        expect(el.getAttribute('aria-label')).toBe('b');
    });
});
