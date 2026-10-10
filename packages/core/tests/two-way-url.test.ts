// `::formaction` and the other URL names are sanitised in a two-way binding too (#97).
//
// The inline build now calls core's `bindTwoWay` instead of its own copy, and its copy sanitised a
// URL name on the way to the element. Core's wrote the property as it came: a `javascript:` value
// bound with `::formaction` stayed live in dev. Both builds now share the one that sanitises.

import { describe, it, expect } from 'vitest';
import { signal, bindTwoWay } from '../src/index';

describe('bindTwoWay on a URL name', () => {
    it('refuses a javascript: value and removes the attribute', () => {
        const button = document.createElement('button');
        button.setAttribute('formaction', '/ok');
        bindTwoWay(button, 'formaction', signal('javascript:alert(1)'));
        expect(button.getAttribute('formaction')).toBeNull();
        expect(button.formAction ?? '').not.toContain('javascript:');
    });

    it('control — a plain URL is written', () => {
        const button = document.createElement('button');
        bindTwoWay(button, 'formaction', signal('/submit'));
        expect(button.getAttribute('formaction')).toBe('/submit');
    });
});
