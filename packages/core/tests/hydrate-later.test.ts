// `@hydrate (trigger) { … }` (#160, part 4d): a part of a generated page taken over later.
//
// Mounted, the part is its content between two markers. Written by the server, the same. Hydrated, it
// stays as the server wrote it — no binding, no handler — until its trigger fires; then it is taken
// over with every element kept. The first event on it does not wait: it hydrates the part and is
// dispatched again, so a click on a button that was not live yet still counts once.

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { html } from '../src/renderer/template';
import { hydrateOn } from '../src/renderer/hydrate-on';
import { renderToString } from '../src/server/render-string';
import { hydrateChildren } from '../src/hydrate/adopt';
import { installHydration } from '../src/hydrate/host';
import { signal, collectDisposers } from '../src/reactivity/signal';
import { children } from './string-parity';

beforeAll(() => installHydration());

const pages: HTMLElement[] = [];
afterEach(() => { for (const p of pages.splice(0)) p.remove(); vi.useRealTimers(); });

function page(markup = ''): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = markup;
    document.body.appendChild(el);
    pages.push(el);
    return el;
}

/** A counter in a @hydrate part, with the signal it shows. */
function counter(trigger: string) {
    const count = signal(0);
    const render = () => html`<section>${hydrateOn({ trigger }, () => html`<button @click=${() => count.set((n) => n + 1)}>${count}</button>`)}</section>`;
    return { count, render };
}

/** The part written by the server and hydrated; returns the page, its button, and the disposer. */
function generated(trigger: string) {
    const { count, render } = counter(trigger);
    const markup = renderToString(render);
    const p = page(markup);
    const button = p.querySelector('button')!;
    const [, dispose] = collectDisposers(() => hydrateChildren(p, render));
    return { p, button, count, markup, dispose };
}

describe('a @hydrate part', () => {
    it('mounted, is its content between two markers, live at once', () => {
        const { count, render } = counter('idle');
        const p = page();
        p.appendChild(render());
        expect(p.innerHTML).toBe('<section><!--hydrate--><button>0</button><!--/hydrate--></section>');
        p.querySelector('button')!.click();
        expect(count()).toBe(1);
    });

    it('is written by the server as the client mounts it', () => {
        const { markup } = generated('idle');
        expect(markup).toBe('<section><!--pdx--><!--hydrate--><button><!--pdx-->0<!--/pdx--></button><!--/hydrate--><!--/pdx--></section>');
    });

    it('stays as the server wrote it until its trigger fires, then is taken over with its elements kept', () => {
        vi.useFakeTimers();
        const { p, button, count } = generated('timer(50)');
        count.set(5);
        expect(button.textContent, 'the part followed a signal before its trigger').toBe('0');
        vi.advanceTimersByTime(60);
        expect(p.querySelector('button')).toBe(button);
        expect(button.textContent).toBe('5');
        count.set(6);
        expect(button.textContent).toBe('6');
        const mounted = page();
        mounted.appendChild(counter('idle').render());
        expect(children(p).replace(/>\d</, '>N<')).toBe(children(mounted).replace(/>\d</, '>N<'));
    });

    it('the first event hydrates the part and is dispatched again: a click counts once', () => {
        const { button, count } = generated('timer(100000)');
        button.click();
        expect(count(), 'the click before the part was live was lost, or counted twice').toBe(1);
        expect(button.textContent).toBe('1');
        button.click();
        expect(count()).toBe(2);
    });

    it('a markup that is not the render is rendered afresh in its place', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { count, render } = counter('immediate');
        const p = page('<section><!--pdx--><!--hydrate--><p>not a button</p><!--/hydrate--><!--/pdx--></section>');
        hydrateChildren(p, render);
        expect(p.querySelector('p')).toBeNull();
        p.querySelector('button')!.click();
        expect(count()).toBe(1);
        warn.mockRestore();
    });

    it('taken from the page before its trigger fires, it waits for nothing', () => {
        vi.useFakeTimers();
        const { button, count, dispose } = generated('timer(50)');
        dispose();
        vi.advanceTimersByTime(60);
        count.set(3);
        expect(button.textContent, 'a disposed part was taken over').toBe('0');
    });
});
