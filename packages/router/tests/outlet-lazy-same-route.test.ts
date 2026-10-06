// A second notification for the route already being loaded must not cancel its import.
//
// If `_handleRouteChange` bumped `_navGen` before the "am I already on this route?" early return,
// a call that did nothing would still invalidate the activation in flight: the page's module
// arrives, finds `gen !== this._navGen`, removes its own placeholder and mounts NOTHING. An empty
// outlet, no error, nothing in the console, and it never recovers — the route is claimed, so the
// next notification for it takes the same early return too.
//
// A guard denial that redirects does exactly this: the router writes the path and the route index
// either side of an await, so the target route is notified twice and the second one always lands
// while the chunk is still in flight. Deep-linking to a guarded page would render a blank screen in
// a production build.
//
// Here it is reproduced from the other end, with something a person does: change a query parameter
// while a lazy page is still loading. Same shape, no guard needed.

import { describe, it, expect, beforeAll } from 'vitest';

let gateResolve!: () => void;
(globalThis as Record<string, unknown>).__lazyGate = new Promise<void>(res => { gateResolve = res; });

customElements.define('pdx-lsr-home', class extends HTMLElement {});

// The lazy route's CE is NOT registered, so the outlet takes the import() path.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-lsr-home' },
    { path: '/lazy', tag: 'pdx-lazypage', lazy: true, file: '../tests/fixtures/lazy-page.ts' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise(r => setTimeout(r, 0));

let outlet: Element;

describe('a lazy page notified again for the same route while its chunk is in flight', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        outlet = document.querySelector('pdx-router-outlet')!;
        await tick();

        navigate('/lazy');
        await tick();
        await tick();
        // The import is pending on the gate: this is the window the defect lives in.
        expect(outlet.textContent, 'the lazy branch never started').toContain('Loading');

        // The second notification for the SAME route: navigating to the page again, which is
        // what a person does when a page is slow to appear. The router republishes the resolved
        // route — a new object for the same path — so the outlet is notified and returns early.
        navigate('/lazy');
        await tick();

        gateResolve();
        // Waited FOR, not counted out. Three ticks was a bet on the machine, and it lost under the
        // full gate: the dynamic import is real work, and the run that transformed 128 seconds of
        // TypeScript alongside it left the placeholder still on screen. A fixed number of ticks is
        // the sleep-instead-of-synchronisation this repository forbids, and it fails in the worst
        // way — green alone, red in the suite.
        for (let i = 0; i < 200 && !outlet.querySelector('pdx-lazypage'); i++) await tick();
    });

    it('mounts the page when the chunk arrives', () => {
        expect(outlet.querySelector('pdx-lazypage'),
            'the import resolved and mounted nothing: an early return cancelled the activation')
            .not.toBeNull();
    });

    it('and the placeholder is gone', () => {
        // The other half of the symptom: a blank outlet, not a stuck spinner.
        expect(outlet.textContent ?? '').not.toContain('Loading');
    });

    it('and the address is the page, once', () => {
        // The control for the early return itself: it must still do its own job.
        expect(location.pathname).toBe('/lazy');
    });
});
