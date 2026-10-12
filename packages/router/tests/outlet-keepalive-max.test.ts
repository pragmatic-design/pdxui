// Kept-alive route pages are bounded by the outlet (#270; beta spec, lifecycle.md, «Frozen is
// bounded»; data.md, E9): at most `keep-alive-max` frozen pages, default 10, the least recently used
// destroyed first. `@page { keepAlive: n }` keeps its meaning, a timeout in ms.
//
// The pages emulate PdxElement's freeze semantics, as outlet-keepalive-dispose.test.ts does: a
// disconnect with `_keepAlive` set is a freeze, without it a destroy.

import { describe, it, expect, beforeAll } from 'vitest';

const destroyed: string[] = [];
const PAGES = 12;

for (let i = 0; i < PAGES; i++) {
    customElements.define(`pdx-kmax-${i}`, class extends HTMLElement {
        _keepAlive = false;
        disconnectedCallback() { if (!this._keepAlive) destroyed.push(`p${i}`); }
    });
}
customElements.define('pdx-kmax-home', class extends HTMLElement {});

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-kmax-home' },
    ...Array.from({ length: PAGES }, (_, i) => ({ path: `/p${i}`, tag: `pdx-kmax-${i}`, keepAlive: true })),
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
const visit = async (path: string) => { navigate(path); await tick(); };

describe('the outlet bounds its frozen pages', () => {
    let outlet: HTMLElement;
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        outlet = document.createElement('pdx-router-outlet');
        document.body.appendChild(outlet);
        await tick();
    });

    it('keep-alive-max="2": the third frozen page evicts the first', async () => {
        outlet.setAttribute('keep-alive-max', '2');
        await visit('/p0'); await visit('/p1'); await visit('/');
        expect(destroyed, 'a page was destroyed within the maximum').toEqual([]);
        await visit('/p2'); await visit('/');
        expect(destroyed, 'the least recently used frozen page was not destroyed').toEqual(['p0']);
    });

    it('a page visited again moves to the most recently used end', async () => {
        destroyed.length = 0;
        // Frozen now: p1, p2 (p1 the oldest). Visit p1 again: p2 becomes the oldest.
        await visit('/p1'); await visit('/');
        await visit('/p3'); await visit('/');
        expect(destroyed).toEqual(['p2']);
    });

    it('the default is 10', async () => {
        destroyed.length = 0;
        outlet.removeAttribute('keep-alive-max');
        // Frozen: p1, p3. Eight more make ten — nothing is evicted.
        for (let i = 4; i < 12; i++) await visit(`/p${i}`);
        await visit('/');
        expect(destroyed, 'evicted within the default of 10').toEqual([]);
        // The eleventh evicts the least recently used, p1.
        await visit('/p0'); await visit('/');
        expect(destroyed).toEqual(['p1']);
    });
});
