// A page NAVIGATED to lands inside a PDX-authored layout, not after it.
//
// A layout written in `.pdx` is a light-DOM component, and on render it REPLACES its `<slot>` with
// the children it captured (`core/src/component/element.ts`, projection). So placing a page with
// `layout.querySelector('slot')` works only for the first page — appended before the layout
// rendered, and projected into place. Every later page finds no `<slot>`, falls back to the layout
// element, and lands after the layout's whole content: below a 100vh shell, where it looks as if
// the click had done nothing until a reload.
//
// The layout here does what a PDX component does: capture, render, replace the slot.
import { describe, it, expect, beforeAll } from 'vitest';

class ProjectingLayout extends HTMLElement {
    // In a microtask, as a PDX component's first render is: the outlet has appended the first page
    // by then, which is what the render captures and projects — and why the slot is then gone.
    connectedCallback() { queueMicrotask(() => this.render()); }
    render() {
        const captured = Array.from(this.childNodes);
        for (const n of captured) n.remove();
        this.innerHTML = '<header class="bar">bar</header><main><slot></slot></main>';
        const slot = this.querySelector('slot')!;
        for (const n of captured) slot.parentNode!.insertBefore(n, slot);
        if (captured.length > 0) slot.remove();
    }
}
customElements.define('pdx-proj-layout', ProjectingLayout);
customElements.define('pdx-proj-a', class extends HTMLElement {});
customElements.define('pdx-proj-b', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/a', tag: 'pdx-proj-a', layouts: ['pdx-proj-layout'] },
    { path: '/b', tag: 'pdx-proj-b', layouts: ['pdx-proj-layout'] },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeAll(async () => {
    history.replaceState(null, '', '/a');
    document.body.appendChild(document.createElement('pdx-router-outlet'));
    await tick();
});

describe('a layout that projects its slot, as a .pdx component does', () => {
    it('holds the first page where its slot was', () => {
        expect(document.querySelector('pdx-proj-layout main pdx-proj-a'), 'the first page is not in the layout\'s main')
            .not.toBeNull();
    });

    it('and a page NAVIGATED to goes to the same place, not after the layout', async () => {
        navigate('/b');
        await tick();
        const b = document.querySelector('pdx-proj-b');
        expect(b, 'the second page did not render').not.toBeNull();
        expect(b!.closest('main'), 'the navigated page landed outside the layout\'s main').not.toBeNull();
        expect(document.querySelector('pdx-proj-a'), 'the first page is still there').toBeNull();
    });

    it('control — the layout was built once, not rebuilt for the second page', () => {
        expect(document.querySelectorAll('pdx-proj-layout')).toHaveLength(1);
    });
});
