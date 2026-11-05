// html`` finds a template's bindings once, not once per instance.
//
// Every clone of a template has its placeholders in the same places. They were found again for every
// call: every element and attribute of the clone read, then a walk over its comments and one over its
// text. The library renders through html``, so that was paid by every component instance: measured on
// an unminified production build of the `component-mount` scenario, 100 `pdx-button`s and 100 `pdx-input`s mount in 0.82× the time, 100
// `pdx-select`s in 0.91×, 100 `pdx-entity-grid`s in 0.92×.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { signal } from '../src/reactivity/signal';

afterEach(() => { vi.restoreAllMocks(); });

const render = (frag: DocumentFragment): HTMLElement => {
    const host = document.createElement('div');
    host.appendChild(frag);
    return host;
};

describe('html — the bindings of a template are found once', () => {
    it('does not scan a clone for its placeholders', () => {
        const view = (label: string, n: () => number) =>
            html`<p class="a ${label}" :title=${label}><b>${label}</b> ${n}</p>`;
        const n = () => 1;
        view('first', n);

        const qsa = vi.spyOn(DocumentFragment.prototype, 'querySelectorAll');
        const walker = vi.spyOn(document, 'createTreeWalker');
        for (let i = 0; i < 100; i++) view(`x${i}`, n);
        expect(qsa.mock.calls.length, 'a clone was scanned for its attributes').toBe(0);
        expect(walker.mock.calls.length, 'a clone was walked for its comments or text').toBe(0);
    });

    it('binds each instance with its own values', () => {
        const view = (label: string) => html`<p class="a ${label} b" data-x=${label}>${label}</p>`;
        const one = render(view('one')).firstElementChild!;
        const two = render(view('two')).firstElementChild!;
        expect(one.className).toBe('a one b');
        expect(two.className).toBe('a two b');
        expect(one.getAttribute('data-x')).toBe('one');
        expect(two.getAttribute('data-x')).toBe('two');
        expect(one.textContent).toBe('one');
        expect(two.textContent).toBe('two');
    });

    it('keeps a mixed attribute reactive when one of its parts is a function', () => {
        const tone = signal('info');
        const view = () => html`<span class="badge ${() => tone()} round"></span>`;
        view();
        const el = render(view()).firstElementChild!;
        expect(el.className).toBe('badge info round');
        tone.set('danger');
        expect(el.className).toBe('badge danger round');
    });

    it('reaches every placeholder of a clone after the earlier ones have inserted nodes', () => {
        const view = (items: string[], tail: string) => html`<ul>${items.map(i => html`<li>${i}</li>`)}<li :id=${tail}>${tail}</li></ul>${tail}`;
        view(['a'], 'z');
        const host = render(view(['a', 'b', 'c'], 'end'));
        expect([...host.querySelectorAll('li')].map(li => li.textContent)).toEqual(['a', 'b', 'c', 'end']);
        expect(host.querySelector('li:last-child')!.id).toBe('end');
        expect(host.lastChild!.textContent).toBe('end');
    });

    it('binds placeholders in nested elements and in several attributes of one element', () => {
        const view = (a: string, b: string) =>
            html`<section><div><span data-a=${a} data-b=${b} title="${a}-${b}">${a}${b}</span></div></section>`;
        view('0', '0');
        const span = render(view('1', '2')).querySelector('span')!;
        expect(span.getAttribute('data-a')).toBe('1');
        expect(span.getAttribute('data-b')).toBe('2');
        expect(span.title).toBe('1-2');
        expect(span.textContent).toBe('12');
    });
});
