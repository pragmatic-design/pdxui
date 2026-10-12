// `@show` false shows nothing, text included (#265; beta spec, lifecycle.md, «The matrix», column
// hidden; «Acceptance cases», case 7).
//
// show() hid only the ELEMENTS at the root of its block, with display:none, and skipped the rest: in
// `@show (open) { Details: <b>x</b> }` with `open` false, «Details:» stayed on the page and only the
// <b> went. A text node cannot take a style, so it is taken out and put back in its place.

import { describe, it, expect, beforeEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';
import { show } from '../src/renderer/helpers';

/** What a reader sees: the text of the rendered nodes, skipping what display:none hides. */
function visibleText(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node instanceof HTMLElement && node.style.display === 'none') return '';
    return Array.from(node.childNodes).map(visibleText).join('');
}

/** Lets a pending flush run. */
const settle = () => new Promise(r => setTimeout(r, 0));

function mount(open: boolean) {
    const visible = signal(open);
    const box = document.createElement('div');
    document.body.appendChild(box);
    box.appendChild(show(() => visible(), html`Details: <b>x</b>`));
    return { visible, box };
}

describe('show() with a text node at the root of its block', () => {
    beforeEach(() => { document.body.innerHTML = ''; });

    it('false: the text is not on the page', () => {
        const { box } = mount(false);
        expect(box.textContent, '«Details:» is still on the page').not.toContain('Details');
        expect(visibleText(box).trim()).toBe('');
    });

    it('true: the text and the element, in their order', () => {
        const { box } = mount(true);
        expect(visibleText(box).trim()).toBe('Details: x');
    });

    it('toggled three times: back in its place, once', async () => {
        const { visible, box } = mount(true);
        for (const v of [false, true, false, true]) {
            visible.set(v);
            await settle();
            expect(visibleText(box).trim(), `after setting ${v}`).toBe(v ? 'Details: x' : '');
        }
        expect(visibleText(box).trim()).toBe('Details: x');
        expect(box.textContent!.match(/Details/g), 'the text was put back more than once').toHaveLength(1);
        // In its place: before the <b>, not after it.
        const b = box.querySelector('b')!;
        expect(b.previousSibling?.textContent).toContain('Details');
    });

    it('an interpolated text at the root: hidden, and current when shown again', async () => {
        // Hidden, the text node is out of the page; the template path's text binding returned early
        // on a node with no parent, so it came back with the value it had when it was hidden.
        const visible = signal(true);
        const name = signal('Ann');
        const box = document.createElement('div');
        document.body.appendChild(box);
        box.appendChild(show(() => visible(), html`Hi ${() => name()} <b>x</b>`));
        expect(visibleText(box).replace(/\s+/g, ' ').trim()).toBe('Hi Ann x');
        visible.set(false);
        await settle();
        expect(visibleText(box).trim(), 'an interpolated root text stayed visible').toBe('');
        name.set('Bob');
        await settle();
        visible.set(true);
        await settle();
        expect(visibleText(box).replace(/\s+/g, ' ').trim(), 'the text came back stale').toBe('Hi Bob x');
    });

    it('control — an element at the root keeps its node and takes display:none', async () => {
        const visible = signal(true);
        const box = document.createElement('div');
        document.body.appendChild(box);
        box.appendChild(show(() => visible(), html`<p>kept</p>`));
        const p = box.querySelector('p')!;
        visible.set(false);
        await settle();
        expect(box.querySelector('p'), 'an element was detached: its state would be lost').toBe(p);
        expect(p.style.display).toBe('none');
    });
});
