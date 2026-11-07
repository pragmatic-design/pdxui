// `@hydrate trigger;` on a component (#160, part 4d): a generated host is taken over when its trigger
// fires, not at boot. Until then it stands as the server wrote it, unmounted, and the components inside
// it wait for it; the first event on it takes it over at once and is dispatched again, so a click on
// a host not live yet still counts once.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { renderToString } from '../src/server/render-string';
import { installHydration } from '../src/hydrate/host';
import { signal } from '../src/reactivity/signal';
import { component } from '../src/component/component';
import { prop } from '../src/component/component-descriptor';

const clicks = signal(0);

beforeAll(() => {
    installHydration();
    component('hl-badge', { props: { text: prop('') }, render: (ctx) => html`<b>${ctx.text}</b>` });
    component('hl-later', {
        hydrate: { trigger: 'timer(40)' },
        props: { label: prop('') },
        render: (ctx) => html`<button @click=${() => clicks.set((n) => n + 1)}>${ctx.label}</button><hl-badge :text=${() => ctx.label()}></hl-badge>`,
    });
    component('hl-clicked', {
        hydrate: { trigger: 'timer(600000)' },
        render: () => html`<button @click=${() => clicks.set((n) => n + 1)}>${clicks}</button>`,
    });
});

const pages: HTMLElement[] = [];
afterEach(() => { for (const p of pages.splice(0)) p.remove(); clicks.set(0); });

/** The markup the server writes for `markup`, parsed in a page where the components are defined. */
function generated(markup: () => DocumentFragment): HTMLElement {
    const box = document.createElement('div');
    box.innerHTML = renderToString(markup);
    document.body.appendChild(box);
    pages.push(box);
    return box;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('a component that hydrates later', () => {
    it('stands as the server wrote it until its trigger fires, then is taken over with its elements kept', async () => {
        const p = generated(() => html`<hl-later label="Save"></hl-later>`);
        const host = p.querySelector('hl-later')!;
        const button = host.querySelector('button')!;
        const badge = host.querySelector('hl-badge')!;
        expect(host.hasAttribute('data-pdx-ssr'), 'the host was taken over before its trigger').toBe(true);
        expect(badge.hasAttribute('data-pdx-ssr'), 'a component inside it did not wait for it').toBe(true);
        await wait(80);
        expect(host.hasAttribute('data-pdx-ssr')).toBe(false);
        expect(badge.hasAttribute('data-pdx-ssr')).toBe(false);
        expect(host.querySelector('button')).toBe(button);
        expect(host.querySelector('hl-badge')).toBe(badge);
        button.click();
        expect(clicks()).toBe(1);
    });

    it('the first click takes it over and is dispatched again: it counts once', () => {
        const p = generated(() => html`<hl-clicked></hl-clicked>`);
        const host = p.querySelector('hl-clicked')!;
        const button = host.querySelector('button')!;
        expect(host.hasAttribute('data-pdx-ssr')).toBe(true);
        button.click();
        expect(clicks(), 'the click before the host was live was lost, or counted twice').toBe(1);
        expect(host.querySelector('button')).toBe(button);
        expect(button.textContent).toBe('1');
    });

    it('mounted with no generated markup, it renders at once', () => {
        const box = document.createElement('div');
        document.body.appendChild(box);
        pages.push(box);
        box.innerHTML = '<hl-clicked></hl-clicked>';
        box.querySelector('button')!.click();
        expect(clicks()).toBe(1);
    });
});
