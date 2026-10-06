// setProp and the DOM primitives.
//
// setProp is where every binding in every template ends up, and two of its branches are security
// decisions: an `onclick` built out of bound data, and a `javascript:` URL arriving in an href.
// A defence without a test is a defence in the worst state.

import { describe, it, expect, vi } from 'vitest';
import { setProp, insert, remove, text, marker, __staticHTML } from '../src/renderer/dom';

const div = () => document.createElement('div');

describe('setProp — events', () => {
    it('@event adds a listener', () => {
        const el = div();
        const fn = vi.fn();
        setProp(el, '@click', fn);
        el.dispatchEvent(new Event('click'));
        expect(fn).toHaveBeenCalled();
    });

    it('binds the event name after the @, whatever it is', () => {
        const el = div();
        const fn = vi.fn();
        setProp(el, '@my-custom-thing', fn);
        el.dispatchEvent(new CustomEvent('my-custom-thing'));
        expect(fn).toHaveBeenCalled();
    });
});

describe('setProp — inline handler attributes are refused', () => {
    it('drops onclick instead of installing a handler made of data', () => {
        const el = div();
        el.setAttribute('onclick', 'alert(1)');

        setProp(el, 'onclick', 'alert(2)');

        expect(el.getAttribute('onclick'),
            'a bound value became an executable inline handler').toBeNull();
    });

    it('refuses whatever the case', () => {
        const el = div();
        setProp(el, 'OnMouseOver', 'x');
        expect(el.hasAttribute('OnMouseOver')).toBe(false);
        expect(el.hasAttribute('onmouseover')).toBe(false);
    });

    it('names the right syntax in the warning', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        setProp(div(), 'onclick', 'x');
        expect(warn.mock.calls.some((c) => String(c[0]).includes('@click')),
            'the refusal did not say what to write instead').toBe(true);
        warn.mockRestore();
    });

    it('leaves a legitimate attribute that merely starts with "on" — via a real one', () => {
        // The rule is deliberately broad (`/^on/i`), so this records what it costs: `only` is
        // fine, `onward` is fine, and neither is settable. The control is that a name NOT
        // starting with "on" still goes through untouched.
        const el = div();
        setProp(el, 'one', 'x');
        expect(el.getAttribute('one'), 'the "on" rule swallowed a normal attribute').toBeNull();
        setProp(el, 'data-one', 'x');
        expect(el.getAttribute('data-one')).toBe('x');
    });
});

describe('setProp — URL attributes are sanitised', () => {
    for (const attr of ['href', 'src', 'action', 'formaction', 'poster']) {
        it(`${attr}: a javascript: URL is dropped, not written`, () => {
            const el = document.createElement('a');
            setProp(el, attr, 'javascript:alert(1)');
            expect(el.getAttribute(attr), `${attr} accepted an executable URL`).toBeNull();
        });
    }

    it('keeps a normal URL, relative or absolute', () => {
        const el = document.createElement('a');
        setProp(el, 'href', '/users/1');
        expect(el.getAttribute('href')).toBe('/users/1');
        setProp(el, 'href', 'https://example.com/x?a=1#f');
        expect(el.getAttribute('href')).toBe('https://example.com/x?a=1#f');
    });

    it('matches the attribute name case-insensitively', () => {
        const el = document.createElement('a');
        setProp(el, 'HREF', 'javascript:alert(1)');
        expect(el.getAttribute('HREF')).toBeNull();
    });

    it('leaves :data alone — it carries bound arrays, not a URL', () => {
        // Sanitising it would stringify whatever a grid or a chart is bound to.
        const el = div();
        setProp(el, 'data', 'javascript:whatever');
        expect(el.getAttribute('data')).toBe('javascript:whatever');
    });

    it('a non-URL attribute is not sanitised', () => {
        const el = div();
        setProp(el, 'title', 'javascript:not-a-url');
        expect(el.getAttribute('title')).toBe('javascript:not-a-url');
    });
});

describe('setProp — style, class, booleans and nullish', () => {
    it('an object style is assigned field by field, keeping what was there', () => {
        const el = div();
        el.style.color = 'red';
        setProp(el, 'style', { backgroundColor: 'blue' });
        expect(el.style.backgroundColor).toBe('blue');
        expect(el.style.color, 'assigning one property wiped the others').toBe('red');
    });

    it('a string style goes through as an attribute', () => {
        const el = div();
        setProp(el, 'style', 'color: green');
        expect(el.getAttribute('style')).toContain('green');
    });

    it('a null style is removed rather than written as "null"', () => {
        const el = div();
        setProp(el, 'style', 'color: green');
        setProp(el, 'style', null);
        expect(el.hasAttribute('style')).toBe(false);
    });

    it('class replaces the className', () => {
        const el = div();
        el.className = 'old';
        setProp(el, 'class', 'a b');
        expect(el.className).toBe('a b');
    });

    it('true writes the empty attribute, false removes it', () => {
        const el = document.createElement('input');
        setProp(el, 'disabled', true);
        expect(el.getAttribute('disabled')).toBe('');
        setProp(el, 'disabled', false);
        expect(el.hasAttribute('disabled')).toBe(false);
    });

    it('null and undefined remove the attribute', () => {
        const el = div();
        el.setAttribute('title', 'x');
        setProp(el, 'title', null);
        expect(el.hasAttribute('title')).toBe(false);

        el.setAttribute('title', 'x');
        setProp(el, 'title', undefined);
        expect(el.hasAttribute('title'), 'undefined was written as the string "undefined"').toBe(false);
    });

    it('0 and the empty string are values, not absence', () => {
        const el = div();
        setProp(el, 'tabindex', 0);
        expect(el.getAttribute('tabindex')).toBe('0');
        setProp(el, 'title', '');
        expect(el.getAttribute('title')).toBe('');
    });

    it('anything else is stringified', () => {
        const el = div();
        setProp(el, 'data-n', 42);
        expect(el.getAttribute('data-n')).toBe('42');
    });
});

describe('insert / remove', () => {
    it('appends when there is no marker', () => {
        const parent = div();
        const a = div(), b = div();
        insert(parent, a);
        insert(parent, b);
        expect([...parent.children]).toEqual([a, b]);
    });

    it('inserts before the marker when there is one', () => {
        const parent = div();
        const a = div(), b = div();
        insert(parent, a);
        insert(parent, b, a);
        expect([...parent.children]).toEqual([b, a]);
    });

    it('a null marker means append', () => {
        const parent = div();
        const a = div(), b = div();
        insert(parent, a);
        insert(parent, b, null);
        expect([...parent.children]).toEqual([a, b]);
    });

    it('removing a detached node is not an error', () => {
        expect(() => remove(div())).not.toThrow();
    });

    it('removes a node from its parent', () => {
        const parent = div();
        const child = div();
        parent.appendChild(child);
        remove(child);
        expect(parent.children).toHaveLength(0);
    });
});

describe('text and marker', () => {
    it('text makes a real text node', () => {
        const n = text('hello');
        expect(n.nodeType).toBe(Node.TEXT_NODE);
        expect(n.data).toBe('hello');
    });

    it('marker makes a comment, labelled or not', () => {
        expect(marker('for').nodeType).toBe(Node.COMMENT_NODE);
        expect(marker('for').data).toBe('for');
        expect(marker().data).toBe('');
    });
});

describe('__staticHTML', () => {
    it('parses the markup into a fragment', () => {
        const frag = __staticHTML('<p class="x">hi</p>');
        expect((frag.firstElementChild as HTMLElement).outerHTML).toBe('<p class="x">hi</p>');
    });

    it('hands back a fresh clone each time, so two mounts do not share nodes', () => {
        const a = __staticHTML('<p>same</p>');
        const b = __staticHTML('<p>same</p>');
        expect(a.firstElementChild).not.toBe(b.firstElementChild);

        (a.firstElementChild as HTMLElement).textContent = 'edited';
        const c = __staticHTML('<p>same</p>');
        expect(c.firstElementChild!.textContent,
            'the cached template was mutated through a clone').toBe('same');
    });

    it('an empty string gives an empty fragment', () => {
        expect(__staticHTML('').childNodes).toHaveLength(0);
    });
});
