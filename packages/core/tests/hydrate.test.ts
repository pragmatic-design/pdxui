// Hydration of html`` (#160, part 4a): the client takes over the nodes renderToString wrote.
//
// Each case renders a template to a string, puts the markup in a page as the browser would parse it,
// and hydrates it with the same render. The page must end as a mount of the render would (compared
// canonically, string-parity.ts), with the server's markers gone, every element the server wrote still
// the same object, and the bindings live: a signal changed afterwards changes the adopted node.

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { html } from '../src/renderer/template';
import { when, show, each, eachRow, match } from '../src/renderer/helpers';
import { whenChain } from '../src/renderer/when-chain';
import { dynamic } from '../src/renderer/dynamic';
import { errorBoundary } from '../src/renderer/error-boundary';
import { defer } from '../src/renderer/defer';
import { awaitBlock } from '../src/renderer/await';
import { renderToString } from '../src/server/render-string';
import { hydrateChildren, HydrationMismatch } from '../src/hydrate/adopt';
import { installHydration } from '../src/hydrate/host';
import { signal } from '../src/reactivity/signal';
import { children } from './string-parity';

// The blocks adopt through what the app that hydrates installs.
beforeAll(() => installHydration());

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

    it('a block that cannot adopt is built in its place, and works', () => {
        const tag = signal('x-hydrate-built');
        const { page: p } = hydrated(() => html`<section><h2>t</h2>${portalLike(() => tag())}</section>`);
        expect(p.querySelector('h2')).not.toBeNull();
    });
});

describe('hydrating the helpers\' blocks', () => {
    it('when(): its branch adopted, and swapped later', () => {
        const open = signal(true);
        const { page: p, written } = hydrated(() => html`<section><h2>t</h2>${when(() => open(), () => html`<p>open ${() => open()}</p>`, () => html`<p>closed</p>`)}</section>`);
        adoptedAll(p, written);
        open.set(false);
        expect(p.querySelector('section')!.textContent).toBe('tclosed');
        open.set(true);
        expect(p.querySelector('section')!.textContent).toBe('topen true');
    });

    it('when() with nothing to show: its markers alone', () => {
        const open = signal(false);
        const { page: p, written } = hydrated(() => html`<div>${when(() => open(), () => html`<b>x</b>`)}</div>`);
        adoptedAll(p, written);
        open.set(true);
        expect(p.querySelector('b')).not.toBeNull();
    });

    it('whenChain(): the branch picked adopted, and another picked later', () => {
        const n = signal(2);
        const { page: p, written } = hydrated(() => html`<div>${whenChain(() => (n() === 1 ? 0 : n() === 2 ? 1 : 2), [() => html`<b>one</b>`, () => html`<b>two</b>`, () => html`<b>other</b>`])}</div>`);
        adoptedAll(p, written);
        n.set(1);
        expect(p.querySelector('div')!.textContent).toBe('one');
    });

    it('match(): the case adopted, and another later', () => {
        const status = signal<'on' | 'off'>('off');
        const { page: p, written } = hydrated(() => html`<div>${match(() => status(), { on: () => html`<b>On</b>`, off: () => html`<b>Off</b>` })}</div>`);
        adoptedAll(p, written);
        status.set('on');
        expect(p.querySelector('div')!.textContent).toBe('On');
    });

    it('each(): its rows adopted, then reconciled by key', () => {
        const rows = signal([{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 3, n: 'c' }]);
        const { page: p, written } = hydrated(() => html`<ul>${each(() => rows(), 'id', (r) => html`<li>${r.n}</li>`)}</ul>`);
        adoptedAll(p, written);
        const [a, , c] = Array.from(p.querySelectorAll('li'));
        rows.set([{ id: 3, n: 'c' }, { id: 1, n: 'a' }]);
        const after = Array.from(p.querySelectorAll('li'));
        expect(after.map((li) => li.textContent)).toEqual(['c', 'a']);
        expect(after[0], 'a kept row is the adopted node').toBe(c);
        expect(after[1]).toBe(a);
    });

    it('eachRow(): the adopted rows follow their item', () => {
        const rows = signal([{ id: 1, n: 'a' }, { id: 2, n: 'b' }]);
        const { page: p, written } = hydrated(() => html`<ul>${eachRow(() => rows(), 'id', (r, i) => html`<li>${() => `${i()}:${r().n}`}</li>`)}</ul>`);
        adoptedAll(p, written);
        const first = p.querySelector('li')!;
        rows.set([{ id: 1, n: 'A' }, { id: 2, n: 'b' }]);
        expect(p.querySelector('li')).toBe(first);
        expect(first.textContent).toBe('0:A');
    });

    it('a when() inside a row, inside a when()', () => {
        const rows = signal([{ id: 1, on: true }, { id: 2, on: false }]);
        const visible = signal(true);
        const { page: p, written } = hydrated(() => html`<div>${when(() => visible(), () => html`<ul>${each(() => rows(), 'id', (r) => html`<li>${when(() => r.on, () => html`<b>on</b>`, () => html`<i>off</i>`)}</li>`)}</ul>`)}</div>`);
        adoptedAll(p, written);
        visible.set(false);
        expect(p.querySelector('ul')).toBeNull();
    });
});

/** A block that does not adopt: built by the client in its place. */
function portalLike(tag: () => string): DocumentFragment {
    return dynamic(tag);
}

describe('hydrating an error boundary', () => {
    it('the content the server rendered is adopted', () => {
        const { page: p, written } = hydrated(() => html`<div>${errorBoundary(() => html`<p>fine</p>`, () => html`<p>caught</p>`)}</div>`);
        adoptedAll(p, written);
    });

    it('the fallback the server rendered is adopted, and its retry renders the content', () => {
        let broken = true;
        const render = () => html`<div>${errorBoundary(
            () => { if (broken) throw new Error('down'); return html`<p>back</p>`; },
            (err, retry) => html`<p class="err">${err.message}</p><button @click=${retry}>retry</button>`,
        )}</div>`;
        const { page: p, written } = hydrated(render);
        adoptedAll(p, written);
        expect(p.querySelector('.err')!.textContent).toBe('down');
        broken = false;
        p.querySelector('button')!.click();
        expect(p.querySelector('div')!.textContent).toBe('back');
    });
});

describe('hydrating a deferred block', () => {
    it('a viewport trigger takes the sentinel the server wrote, and the placeholder is adopted', () => {
        const { page: p, written } = hydrated(() => html`<div>${defer({ trigger: 'viewport', placeholder: () => html`<p class="wait">wait</p>` }, null, () => html`<p>in</p>`)}</div>`);
        adoptedAll(p, written);
        expect(p.querySelectorAll('span'), 'one sentinel, the server\'s').toHaveLength(1);
    });

    it('a trigger that fires at once: the body the server rendered is adopted', () => {
        const { page: p, written } = hydrated(() => html`<div>${defer({ trigger: 'immediate' }, null, () => html`<p>in ${'x'}</p>`)}</div>`);
        adoptedAll(p, written);
    });
});

describe('hydrating an await block', () => {
    it('a value there is: the body the server rendered is adopted', () => {
        const { page: p, written } = hydrated(() => html`<div>${awaitBlock(() => 'done', (v) => html`<p>ready ${() => v()}</p>`, () => html`<p>…</p>`, null)}</div>`);
        adoptedAll(p, written);
    });

    it('a promise: the @loading the server wrote is adopted, and the body follows it', async () => {
        const data = Promise.resolve('done');
        const { page: p, written } = hydrated(() => html`<div>${awaitBlock(() => data, (v) => html`<p>ready ${() => v()}</p>`, () => html`<p class="wait">…</p>`, null)}</div>`);
        adoptedAll(p, written);
        await data;
        await new Promise((r) => setTimeout(r, 0));
        expect(p.querySelector('div')!.textContent).toBe('ready done');
    });

    it('with minMs, the pending comment the server wrote is the one the block keeps', () => {
        const data = new Promise(() => {});
        const { page: p } = hydrated(() => html`<div>${awaitBlock(() => data, () => html`<p>x</p>`, () => html`<p>…</p>`, null, { minMs: 50 })}</div>`);
        expect(p.querySelector('div')!.innerHTML).toBe('<!--await--><!--await-pending--><!--/await-->');
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
