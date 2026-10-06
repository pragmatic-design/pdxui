// A reactive block that goes from elements to an empty array clears them.
//
// The block keeps its first node as the anchor for the next render. An empty array makes no nodes,
// so the anchor stays — and after a render of elements the anchor IS the first element: `[a]`
// then `[]` would leave `a` on the page, and a list such as pdx-file-upload's refused files would
// never empty.

import { describe, it, expect, afterEach } from 'vitest';
import { signal } from '../src/reactivity/signal';
import { html } from '../src/renderer/template';

function mount(frag: DocumentFragment): HTMLElement {
    const host = document.createElement('div');
    host.appendChild(frag);
    document.body.appendChild(host);
    return host;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('a reactive list that becomes empty', () => {
    it('as an element child: [a, b] then [] leaves nothing, and a later [c] renders in place', () => {
        const items = signal<string[]>(['a', 'b']);
        const root = mount(html`<ul>${() => items().map(i => html`<li>${i}</li>`)}</ul><p>after</p>`);
        expect(root.querySelectorAll('li')).toHaveLength(2);
        items.set([]);
        expect(root.querySelectorAll('li')).toHaveLength(0);
        items.set(['c']);
        expect([...root.querySelectorAll('li')].map(l => l.textContent)).toEqual(['c']);
        expect(root.querySelector('ul + p')?.textContent).toBe('after');
    });

    it('as a text-position child: [a] then [] leaves nothing', () => {
        const items = signal<string[]>(['a']);
        const root = mount(html`<div>before ${() => items().map(i => html`<b>${i}</b>`)} after</div>`);
        expect(root.querySelectorAll('b')).toHaveLength(1);
        items.set([]);
        expect(root.querySelectorAll('b')).toHaveLength(0);
        expect(root.textContent?.replace(/\s+/g, ' ').trim()).toBe('before after');
        items.set(['z']);
        expect([...root.querySelectorAll('b')].map(b => b.textContent)).toEqual(['z']);
    });

    it('an empty fragment clears too', () => {
        const show = signal(true);
        const root = mount(html`<div>${() => show() ? html`<i>x</i>` : document.createDocumentFragment()}</div>`);
        expect(root.querySelectorAll('i')).toHaveLength(1);
        show.set(false);
        expect(root.querySelectorAll('i')).toHaveLength(0);
    });
});
