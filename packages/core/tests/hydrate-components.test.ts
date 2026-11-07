// Hydration of components (#160, part 4a): a host marked `data-pdx-ssr` takes over the markup the
// build wrote for it, where the app hydrates (installHydration).
//
// Each case renders a page to a string and parses it in a document where the components are defined:
// the hosts connect as the markup lands — before the page's own template is adopted, the harder of the
// two orders — and take over their render; then the page's template is adopted, binding the children
// it gave the components, which sit in their slots. The page must end as a mount would, with no marker
// left and every element the build wrote still the same object; a component whose markup is not its
// render renders afresh, keeping the children its parent gave it.

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { html } from '../src/renderer/template';
import { renderToString } from '../src/server/render-string';
import { hydrateChildren } from '../src/hydrate/adopt';
import { installHydration } from '../src/hydrate/host';
import { signal } from '../src/reactivity/signal';
import { component } from '../src/component/component';
import { prop } from '../src/component/component-descriptor';
import { children } from './string-parity';
import { dynamic } from '../src/renderer/dynamic';

beforeAll(() => {
    installHydration();
    component('hy-card', {
        props: { label: prop('none'), count: prop(0, { type: Number }) },
        host: { ':aria-label': (c: { label: () => string }) => c.label() },
        setup: (ctx) => ({ double: () => ctx.count() * 2 }),
        render: (ctx) => html`<div class="card"><h2>${ctx.label}</h2><span>${() => ctx.double()}</span></div>`,
    });
    component('hy-panel', {
        render: () => html`<header><slot name="title">Untitled</slot></header><main><slot></slot></main><footer><slot name="foot">none</slot></footer>`,
    });
    component('hy-inner', { props: { text: prop('') }, render: (ctx) => html`<i>${ctx.text}</i>` });
    component('hy-outer', {
        props: { msg: prop('m') },
        render: (ctx) => html`<section><hy-inner :text=${ctx.msg}></hy-inner><slot></slot></section>`,
    });
    // A component the server cannot render: its render builds DOM itself.
    component('hy-imperative', {
        render: () => {
            const box = document.createElement('div');
            box.className = 'imperative';
            box.appendChild(document.createElement('slot'));
            const frag = document.createDocumentFragment();
            frag.appendChild(box);
            return frag;
        },
    });
});

const pages: HTMLElement[] = [];
afterEach(() => { for (const p of pages.splice(0)) p.remove(); vi.restoreAllMocks(); });

/**
 * The markup parsed in a detached box, then put in the document: the hosts connect with their
 * subtree there, as on a generated page, whose modules run after the parser has finished.
 */
function page(markup = ''): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = markup;
    document.body.appendChild(el);
    pages.push(el);
    return el;
}

/** A page hydrated over its build; compared with a mount of the same render. */
function hydrated(render: () => DocumentFragment): { page: HTMLElement; written: Element[]; markup: string } {
    const mounted = page();
    mounted.appendChild(render());
    const markup = renderToString(render);
    const p = page(markup);
    const written = Array.from(p.querySelectorAll('*'));
    hydrateChildren(p, render);
    expect(children(p), `markup: ${markup}`).toBe(children(mounted));
    expect(p.innerHTML, 'no hydration marker is left').not.toMatch(/<!--\/?pdx(-slot)?[-:\w]*-->/);
    expect(p.querySelector('[data-pdx-ssr]'), 'no host is left marked').toBeNull();
    return { page: p, written, markup };
}

function adoptedAll(p: HTMLElement, written: Element[]): void {
    expect(written.length).toBeGreaterThan(0);
    for (const el of written) expect(p.contains(el), `<${el.localName}> was replaced`).toBe(true);
}

describe('hydrating a component', () => {
    it('its render, props, setup and host binding take over the build\'s markup', () => {
        const label = signal('Hi');
        const { page: p, written } = hydrated(() => html`<hy-card :label=${() => label()} count="3"></hy-card>`);
        adoptedAll(p, written);
        const card = p.querySelector('hy-card')!;
        expect(card.querySelector('span')!.textContent).toBe('6');
        label.set('Ho');
        expect(card.querySelector('h2')!.textContent).toBe('Ho');
        expect(card.getAttribute('aria-label')).toBe('Ho');
    });

    it('the children its parent gives it stay in its slots, bound by the parent', () => {
        const body = signal('one');
        const { page: p, written } = hydrated(() => html`<hy-panel><b slot="title">T</b><p>${() => body()}</p></hy-panel>`);
        adoptedAll(p, written);
        body.set('two');
        expect(p.querySelector('main')!.textContent).toBe('two');
        expect(p.querySelector('footer slot'), 'a slot that received nothing keeps its own content').not.toBeNull();
    });

    it('a component inside a component, a value through the parent\'s template', () => {
        const { page: p, written } = hydrated(() => html`<hy-outer msg="hello">x</hy-outer>`);
        adoptedAll(p, written);
        expect(p.querySelector('hy-inner i')!.textContent).toBe('hello');
    });

    it('<component :is>: the element the server wrote is kept, and swapped when the tag changes', () => {
        const tag = signal('hy-inner');
        const { page: p, written } = hydrated(() => html`<section>${dynamic(() => tag(), () => ({ text: 'hi' }))}</section>`);
        adoptedAll(p, written);
        expect(p.querySelector('hy-inner i')!.textContent).toBe('hi');
        tag.set('hy-card');
        expect(p.querySelector('hy-inner')).toBeNull();
        expect(p.querySelector('hy-card')).not.toBeNull();
    });

    it('markup that is not its render: rendered afresh, keeping the children its parent gave it', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const body = signal('one');
        const render = () => html`<hy-panel><p class="given">${() => body()}</p></hy-panel>`;
        const markup = renderToString(render).replace('<header>', '<aside>').replace('</header>', '</aside>');
        const p = page(markup);
        const given = p.querySelector('.given')!;
        hydrateChildren(p, render);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('<hy-panel> renders afresh'));
        expect(p.querySelector('aside')).toBeNull();
        expect(p.querySelector('header')).not.toBeNull();
        expect(p.querySelector('.given'), 'the parent\'s node, projected again').toBe(given);
        body.set('two');
        expect(given.textContent).toBe('two');
    });

    it('a component the server could not render: its parent\'s children bound, and projected by its mount', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const body = signal('one');
        const render = () => html`<hy-imperative><p class="given">${() => body()}</p></hy-imperative>`;
        const markup = renderToString(render);
        expect(markup).toContain('pdx-slot:1:*');
        const p = page(markup);
        const given = p.querySelector('.given')!;
        hydrateChildren(p, render);
        expect(p.querySelector('.imperative .given'), 'projected into the slot its render built').toBe(given);
        body.set('two');
        expect(given.textContent).toBe('two');
        expect(warn, 'no markup to take over is no mismatch').not.toHaveBeenCalled();
    });
});
