// A virtual list's `@empty` (#1236): held as a plain list's is (#1233, list-empty.ts) — its nodes and
// the scope it was built in. Removed node by node and disposed when the first row comes, and disposed
// with the list. It held one node and threw the scope away: an `@empty` with two roots stayed beside
// the rows, and a binding inside one ran on after it left.

import { describe, it, expect, afterEach } from 'vitest';
import { html } from '../src/renderer/template';
import { eachVirtual } from '../src/renderer/virtual-list';
import { signal, collectDisposers } from '../src/reactivity/signal';

const settle = async (): Promise<void> => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
};

const hosts: HTMLElement[] = [];
afterEach(() => { for (const h of hosts.splice(0)) h.remove(); });

/** A virtual list of `<li>` in a `<ul>`, mounted in its own scope; `dispose` tears the list down. */
function mount(items: () => string[], empty: () => Node) {
    const ul = document.createElement('ul');
    document.body.appendChild(ul);
    hosts.push(ul);
    const [, dispose] = collectDisposers(() => {
        ul.appendChild(eachVirtual(items, (r) => r, (r: string) => html`<li>${r}</li>`, { tag: 'li', estimate: 20, empty }));
    });
    return { ul, dispose };
}

describe("a virtual list's @empty (#1236)", () => {
    it('with two roots: both go when rows come', async () => {
        const items = signal<string[]>([]);
        const { ul } = mount(() => items(), () => html`<li class="none">none</li><li class="hint">add one</li>`);
        await settle();
        expect(ul.querySelectorAll('.none, .hint'), 'the two roots are shown').toHaveLength(2);
        items.set(['a']);
        await settle();
        expect(ul.querySelectorAll('.none, .hint'), 'a root left beside the rows').toHaveLength(0);
        expect(ul.querySelector('[data-virtual-index="0"]')?.textContent).toBe('a');
    });

    it('with a binding: the binding stops when rows come', async () => {
        const items = signal<string[]>([]);
        const count = signal(0);
        let reads = 0;
        mount(() => items(), () => html`<li class="none">${() => { reads++; return count(); }}</li>`);
        await settle();
        expect(reads, 'the binding ran when @empty was shown').toBeGreaterThan(0);
        items.set(['a']);
        await settle();
        const before = reads;
        count.set(1);
        await settle();
        expect(reads, "@empty's binding ran after it left").toBe(before);
    });

    it('with a binding: the binding stops when the list is torn down', async () => {
        const count = signal(0);
        let reads = 0;
        const { dispose } = mount(() => [], () => html`<li class="none">${() => { reads++; return count(); }}</li>`);
        await settle();
        dispose();
        const before = reads;
        count.set(1);
        await settle();
        expect(reads, "@empty's binding ran after the list was torn down").toBe(before);
    });

    it('comes back, built again, when the rows go', async () => {
        const items = signal<string[]>(['a']);
        const { ul } = mount(() => items(), () => html`<li class="none">none</li><li class="hint">add one</li>`);
        await settle();
        expect(ul.querySelectorAll('.none, .hint')).toHaveLength(0);
        items.set([]);
        await settle();
        expect(ul.querySelectorAll('.none, .hint')).toHaveLength(2);
    });
});
