// Hydration of html`` (#160, part 4a): the client takes over the nodes renderToString wrote.
//
// Each case renders a template to a string, puts the markup in a page as the browser would parse it,
// and hydrates it with the same render. The page must end as a mount of the render would (compared
// canonically, string-parity.ts), with the server's markers gone, every element the server wrote still
// the same object, and the bindings live: a signal changed afterwards changes the adopted node.

import { describe, it, expect, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { when, show, each } from '../src/renderer/helpers';
import { renderToString } from '../src/server/render-string';
import { hydrateChildren, HydrationMismatch } from '../src/hydrate/adopt';
import { signal } from '../src/reactivity/signal';
import { children } from './string-parity';

const pages: HTMLElement[] = [];
afterEach(() => { for (const p of pages.splice(0)) p.remove(); });

function page(markup = ''): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = markup;
    document.body.appendChild(el);
    pages.push(el);
    return el;
}

/** Hydrate `render()` over its own server markup; returns the page and the elements the server wrote. */
function hydrated(render: () => DocumentFragment): { page: HTMLElement; written: Element[] } {
    const mounted = page();
    mounted.appendChild(render());
    const markup = renderToString(render);
    const p = page(markup);
    const written = Array.from(p.querySelectorAll('*'));
    hydrateChildren(p, render);
    expect(children(p), `markup: ${markup}`).toBe(children(mounted));
    expect(p.innerHTML, 'the server\'s part markers are gone').not.toMatch(/<!--\/?pdx-->/);
    return { page: p, written };
}

/** Every element the server wrote is still in the page: adopted, not built again. */
function adoptedAll(p: HTMLElement, written: Element[]): void {
    expect(written.length).toBeGreaterThan(0);
    for (const el of written) expect(p.contains(el), `<${el.localName}> was replaced`).toBe(true);
}

describe('hydrating html``', () => {
    it('static markup and text: adopted as it is', () => {
        const { page: p, written } = hydrated(() => html`<section class="a"><h1>Title</h1><p>a &amp; b</p><br><!-- note --></section>`);
        adoptedAll(p, written);
    });

    it('a signal in text: the server\'s text node is the one that changes', () => {
        const name = signal('Ada');
        const { page: p, written } = hydrated(() => html`<p>Hello ${() => name()}, ${name}!</p>`);
        adoptedAll(p, written);
        const text = p.querySelector('p')!.firstChild!.nextSibling as Text;
        expect(text.data).toBe('Ada');
        name.set('Grace');
        expect(p.querySelector('p')!.textContent).toBe('Hello Grace, Grace!');
        expect(p.querySelector('p')!.firstChild!.nextSibling, 'the same text node').toBe(text);
    });

    it('bound attributes and classes stay bound on the adopted element', () => {
        const title = signal('T');
        const on = signal(true);
        const { page: p, written } = hydrated(() => html`<a :title=${() => title()} class="base" :class.on=${() => on()} href=${'/x'}>x</a>`);
        adoptedAll(p, written);
        const a = p.querySelector('a')!;
        title.set('U');
        on.set(false);
        expect(a.getAttribute('title')).toBe('U');
        expect(a.outerHTML).not.toMatch(/class="[^"]*\bon\b/);
    });

    it('a listener is attached to the adopted element', () => {
        let clicks = 0;
        const { page: p, written } = hydrated(() => html`<button @click=${() => { clicks++; }}>b</button>`);
        adoptedAll(p, written);
        p.querySelector('button')!.click();
        expect(clicks).toBe(1);
    });

    it('nested templates, a list of them, and a list of texts the parser merged', () => {
        const items = ['one', 'two'];
        const { page: p, written } = hydrated(() => html`<ul>${items.map((i) => html`<li>${i}</li>`)}</ul><p>${['a', 'b']}${html`<b>${'c'}</b>`}</p>`);
        adoptedAll(p, written);
    });

    it('a value that turns from one template into another after hydrating', () => {
        const on = signal(true);
        const { page: p, written } = hydrated(() => html`<div>${() => (on() ? html`<b>yes</b>` : html`<i>no</i>`)}</div>`);
        adoptedAll(p, written);
        on.set(false);
        expect(p.querySelector('div')!.innerHTML).toBe('<i>no</i>');
    });

    it('a helper\'s block that does not adopt yet is built in its place, and works', () => {
        const open = signal(true);
        const { page: p } = hydrated(() => html`<section><h2>t</h2>${when(() => open(), () => html`<p>open</p>`, () => html`<p>closed</p>`)}</section>`);
        open.set(false);
        expect(p.querySelector('section')!.textContent).toBe('tclosed');
    });

    it('a list built in its place', () => {
        const rows = signal([{ id: 1, n: 'a' }, { id: 2, n: 'b' }]);
        const { page: p } = hydrated(() => html`<ul>${each(() => rows(), 'id', (r) => html`<li>${r.n}</li>`)}</ul>`);
        rows.set([{ id: 1, n: 'a' }]);
        expect(p.querySelectorAll('li')).toHaveLength(1);
    });
});

describe('hydrating show()', () => {
    it('shown: its elements adopted, and hidden later', () => {
        const on = signal(true);
        const { page: p, written } = hydrated(() => html`<div>${show(() => on(), html`<p>x</p>${'t'}`)}</div>`);
        adoptedAll(p, written);
        on.set(false);
        expect(p.querySelector('p')!.style.display).toBe('none');
        expect(p.querySelector('div')!.textContent).toBe('x');
    });

    it('hidden: its texts kept by their comments, and shown later', () => {
        const on = signal(false);
        const { page: p, written } = hydrated(() => html`<div>${show(() => on(), html`<p>x</p>${'t'}`)}</div>`);
        adoptedAll(p, written);
        on.set(true);
        expect(p.querySelector('p')!.style.display).toBe('');
        expect(p.querySelector('div')!.textContent).toBe('xt');
    });
});

describe('a server markup that is not the render', () => {
    it('stops the hydration with a HydrationMismatch', () => {
        const p = page(renderToString(() => html`<p>${'a'}</p>`).replace('<p>', '<div>').replace('</p>', '</div>'));
        expect(() => hydrateChildren(p, () => html`<p>${'a'}</p>`)).toThrow(HydrationMismatch);
    });

    it('and so does markup the render does not have', () => {
        const p = page(`${renderToString(() => html`<p>x</p>`)}<p>extra</p>`);
        expect(() => hydrateChildren(p, () => html`<p>x</p>`)).toThrow(/left after the render/);
    });
});
