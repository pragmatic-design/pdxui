// A frozen (keep-alive) page that is DEFINITIVELY discarded must receive a real
// disconnect so its effects/subscriptions are disposed. Flipping _keepAlive=false and
// dropping the map entry while the element sits in a DocumentFragment is not enough:
// disconnectedCallback never re-fires → leak.

import { describe, it, expect, beforeAll } from 'vitest';

// Track disposal on the page CE, emulating PdxElement's _keepAlive freeze semantics.
let disposedCount = 0;

class KeepPage extends HTMLElement {
    disconnectedCallback() {
        if (this._keepAlive) return; // freeze: skip cleanup (like PdxElement)
        disposedCount++;             // destroy: full cleanup ran
    }
}
customElements.define('pdx-keeppage', KeepPage);

class PlainPage extends HTMLElement {}
customElements.define('pdx-plainpage', PlainPage);

// keepAlive as a small numeric timeout so navigating away freezes, then the timer
// fires _destroyFrozen and the frozen page must be disposed.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-plainpage' },
    { path: '/keep', tag: 'pdx-keeppage', keepAlive: 30 },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise(r => setTimeout(r, 0));
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('router — frozen keep-alive dispose on discard',() => {
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        const outlet = document.createElement('pdx-router-outlet');
        document.body.appendChild(outlet);
        await tick();
    });

    it('disposes a frozen page when its keep-alive timeout discards it', async () => {
        // Enter the keep-alive page.
        navigate('/keep');
        await tick();
        expect(document.querySelector('pdx-keeppage')).toBeTruthy();

        // Leave → the page is frozen (not disposed yet).
        navigate('/');
        await tick();
        expect(disposedCount).toBe(0);

        // Wait past the keepAlive timeout → _destroyFrozen must dispose it.
        await delay(60);
        expect(disposedCount).toBe(1);
    });
});
