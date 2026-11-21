// Core's binding of a plain element's attribute or property, the call a compiled template makes for
// each `:name` (#1207). What it writes is what the compiled module wrote inline before: the same rules
// as core's own binding (`bindProperty` in template.ts).

import { describe, it, expect } from 'vitest';
import { bindAttribute, bindNativeProperty, bindAttributeOrProperty, bindStyleText } from '../src/renderer/bound-attribute';
import { signal, collectDisposers } from '../src/reactivity/signal';

describe('bindAttribute', () => {
    it('sets the attribute, true as the empty attribute, and null or false remove it', () => {
        const el = document.createElement('div');
        const v = signal<unknown>('x');
        bindAttribute(el, 'aria-label', () => v());
        expect(el.getAttribute('aria-label')).toBe('x');
        v.setRaw(true);
        expect(el.getAttribute('aria-label')).toBe('');
        v.setRaw(3);
        expect(el.getAttribute('aria-label')).toBe('3');
        v.setRaw(null);
        expect(el.hasAttribute('aria-label')).toBe(false);
        v.setRaw('y');
        v.setRaw(false);
        expect(el.hasAttribute('aria-label')).toBe(false);
    });

    it('does not write the same value again over what the element holds since (#44)', () => {
        const el = document.createElement('div');
        const v = signal('x');
        const other = signal(0);
        bindAttribute(el, 'title', () => { other(); return v(); });
        el.setAttribute('title', 'changed outside');
        // The binding re-runs on what it READ, with the same value: it writes nothing.
        other.set(1);
        expect(el.getAttribute('title')).toBe('changed outside');
        // The control: a new value is written.
        v.set('z');
        expect(el.getAttribute('title')).toBe('z');
    });

    it('is disposed with the scope that made it', () => {
        const el = document.createElement('div');
        const v = signal('a');
        const [, dispose] = collectDisposers(() => bindAttribute(el, 'title', () => v()));
        dispose();
        v.set('b');
        expect(el.getAttribute('title')).toBe('a');
    });
});

describe('bindNativeProperty', () => {
    it('assigns the property, and null clears it by its type, as clearBoundProperty does', () => {
        const input = document.createElement('input');
        const value = signal<string | null>('typed');
        const disabled = signal<boolean | null>(true);
        bindNativeProperty(input, 'value', 'value', () => value());
        bindNativeProperty(input, 'disabled', 'disabled', () => disabled());
        expect(input.value).toBe('typed');
        expect(input.disabled).toBe(true);
        value.setRaw(null);
        disabled.setRaw(null);
        expect(input.value, 'a string property is emptied').toBe('');
        expect(input.disabled, 'a boolean property is false').toBe(false);
    });

    it('a number property going to null removes the attribute instead of assigning 0', () => {
        const input = document.createElement('input');
        const max = signal<number | null>(5);
        bindNativeProperty(input, 'maxlength', 'maxLength', () => max());
        expect(input.getAttribute('maxlength')).toBe('5');
        max.setRaw(null);
        expect(input.hasAttribute('maxlength')).toBe(false);
    });
});

describe('bindAttributeOrProperty', () => {
    it('assigns a property the element has, and writes the attribute of a name it does not have', () => {
        const label = document.createElement('label');
        const div = document.createElement('div');
        const v = signal<string | null>('email');
        bindAttributeOrProperty(label, 'for', 'htmlFor', () => v());
        bindAttributeOrProperty(div, 'itemprop', 'itemprop', () => v());
        expect(label.htmlFor).toBe('email');
        expect(div.getAttribute('itemprop')).toBe('email');
        expect((div as unknown as Record<string, unknown>).itemprop, 'an expando changes nothing').toBeUndefined();
        v.setRaw(null);
        expect(div.hasAttribute('itemprop')).toBe(false);
    });
});

describe('bindStyleText (#1240)', () => {
    it('writes style.cssText on an SVG element, whose style has only a getter, and null empties it', () => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        const v = signal<string | null>('fill: red');
        bindStyleText(circle, () => v());
        expect(circle.style.getPropertyValue('fill')).toBe('red');
        v.setRaw(null);
        expect(circle.style.cssText, 'null leaves no declaration').toBe('');
        v.setRaw('opacity: 0.5');
        expect(circle.style.getPropertyValue('opacity')).toBe('0.5');
    });

    it('writes style.cssText on an HTML element, and undefined empties it', () => {
        const div = document.createElement('div');
        const v = signal<string | undefined>('color: blue');
        bindStyleText(div, () => v());
        expect(div.style.color).toBe('blue');
        v.setRaw(undefined);
        expect(div.style.cssText).toBe('');
    });

    it('does not write the same value again over what the element holds since (#44)', () => {
        const div = document.createElement('div');
        const v = signal('color: blue');
        const other = signal(0);
        bindStyleText(div, () => { other(); return v(); });
        div.style.color = 'green';
        other.set(1);
        expect(div.style.color).toBe('green');
    });
});
