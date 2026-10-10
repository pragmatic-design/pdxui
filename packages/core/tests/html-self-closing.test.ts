// html`` expands a self-closing non-void element, as the compiler does.
//
// The HTML parser does not honour `/>` on a non-void element: `<x-el />` opens <x-el>, and what
// follows becomes its child. The compiler expands the form in .pdx templates; html`` is where an
// author writes the markup directly (a component's render in .ts), so it gets the same treatment,
// once per template — the parsed template is cached.

import { describe, it, expect } from 'vitest';
import { html, signal } from '../src/index';

const tags = (el: Element) => [...el.children].map((c) => c.tagName.toLowerCase());

describe('html`` and self-closing tags', () => {
    it('<x-probe a="1" /> is closed, and the <p> after it is its sibling', () => {
        const frag = html`<div><x-probe a="1" /><p>after</p></div>`;
        const div = frag.firstElementChild!;
        expect(tags(div)).toEqual(['x-probe', 'p']);
        expect(div.querySelector('x-probe')!.getAttribute('a')).toBe('1');
        expect(div.querySelector('x-probe')!.children).toHaveLength(0);
    });

    it('with a bound attribute before the />', () => {
        const v = signal('x');
        const frag = html`<div><x-probe title=${() => v()} /><span>next</span></div>`;
        const div = frag.firstElementChild!;
        expect(tags(div)).toEqual(['x-probe', 'span']);
        expect(div.querySelector('x-probe')!.getAttribute('title')).toBe('x');
    });

    it('a plain element too, and a /> inside a quoted value is not the end of the tag', () => {
        const frag = html`<section><div class="gap" /><em title="a/>b" /><b>x</b></section>`;
        const sec = frag.firstElementChild!;
        expect(tags(sec)).toEqual(['div', 'em', 'b']);
        expect(sec.querySelector('em')!.getAttribute('title')).toBe('a/>b');
    });

    // The time the expansion takes on the inputs CodeQL names is measured in tests/perf/runtime-scans.test.ts.
    it('an unterminated tag is left as it is, and the tags before it are still expanded', () => {
        const markup = '<div><x-probe /><p>a</p><em title="open';
        const strings = Object.assign([markup], { raw: [markup] }) as unknown as TemplateStringsArray;
        const div = html(strings).firstElementChild!;
        expect(tags(div).slice(0, 2)).toEqual(['x-probe', 'p']);
    });

    it('void elements are left as they are', () => {
        const frag = html`<p><input type="text" /><br/>after</p>`;
        const p = frag.firstElementChild!;
        expect(tags(p)).toEqual(['input', 'br']);
        expect(p.textContent).toBe('after');
    });
});
