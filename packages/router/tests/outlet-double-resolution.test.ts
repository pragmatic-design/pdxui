// Two resolutions of one navigation must still mount one page.
//
// `_handleRouteChange` reads `this._previousRoute` at the top and writes it back only AFTER
// `await checkBeforeLeave(...)`. Any second invocation that starts inside that window reads the
// stale value, so the same-route early return does not fire and the page is activated again.
//
// A router that resolves each navigation twice — under the Navigation API `history.pushState`
// fires the very `navigate` event the same module listens to — would otherwise turn it into one
// removal and TWO additions: every page mounted twice, cards accumulating on each visit, and the
// copy the visitor sees is the stale one, which never updates its params.
//
// The generated router does not do this (packages/compiler/src/plugin-utils.ts). The outlet is a
// public component that anyone can drive — two navigate() calls in a tick, a host with its own
// popstate handling — and it should be correct on its own, not correct because its caller behaves.

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

// Registered BEFORE the outlet connects — autoInitRouter reads these on connect.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/from', tag: 'pdx-dr-from' },
    { path: '/to', tag: 'pdx-dr-to' },
];

/**
 * The leaving page's answer, as a promise the test resolves by hand. Holding it open is what keeps
 * `_handleRouteChange` parked on its await while a second navigation arrives — the window itself.
 */
let gate: { promise: Promise<boolean>; open: () => void };
let asked = 0;

function newGate(answer: boolean): void {
    let resolve!: (v: boolean) => void;
    const promise = new Promise<boolean>(r => { resolve = r; });
    gate = { promise, open: () => resolve(answer) };
}

class FromPage extends HTMLElement {
    _beforeLeaveCallbacks = [() => { asked++; return gate.promise; }];
}
customElements.define('pdx-dr-from', FromPage);

/** Counts its own mounts, so "one page" is asserted on construction as well as on the DOM. */
let mounted = 0;
customElements.define('pdx-dr-to', class extends HTMLElement {
    connectedCallback(): void { mounted++; }
});

import { navigate, currentPath } from '../src/runtime';
import '../src/outlet'; // registers <pdx-router-outlet>

const tick = (): Promise<void> => new Promise(r => setTimeout(r, 0));
const settle = async (n = 8): Promise<void> => { for (let i = 0; i < n; i++) await tick(); };

const outletChildren = (): string[] => {
    const outlet = document.querySelector('pdx-router-outlet');
    return outlet ? Array.from(outlet.children).map(c => c.tagName.toLowerCase()) : [];
};

describe('a navigation resolved twice', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/from');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await settle();
    });

    beforeEach(async () => {
        asked = 0;
        mounted = 0;
        // Back to /from with an open gate, so each test starts from the same place.
        newGate(true);
        navigate('/from');
        await settle();
        gate.open();
        await settle();
        newGate(true);

        // Asserted, not cleaned. The debris IS the defect: a second activation is never removed,
        // so a test that tidied up before starting would hide what the previous one proved.
        expect(outletChildren(), 'the previous test left views mounted in the outlet')
            .toEqual(['pdx-dr-from']);
    });

    it('mounts the destination once when two resolutions overlap', async () => {
        expect(currentPath(), 'the fixture did not start on /from').toBe('/from');

        // First resolution parks on the gate.
        navigate('/to');
        await settle(2);
        expect(asked, 'the outlet never asked the page it was leaving — the window is not open')
            .toBeGreaterThanOrEqual(1);
        expect(outletChildren(), 'the destination mounted before the gate opened').toEqual(['pdx-dr-from']);

        // Second resolution of the SAME navigation, arriving inside that window.
        navigate('/to');
        await settle(2);

        gate.open();
        await settle();

        expect(currentPath()).toBe('/to');
        expect(outletChildren(), 'the outlet mounted the destination more than once').toEqual(['pdx-dr-to']);
        expect(mounted, `the destination element was constructed ${mounted} times`).toBe(1);
    });

    it('still mounts the destination when only one resolution arrives — the control', async () => {
        // Without this, an outlet that dropped every navigation would pass the case above.
        navigate('/to');
        await settle(2);
        gate.open();
        await settle();

        expect(currentPath()).toBe('/to');
        expect(outletChildren()).toEqual(['pdx-dr-to']);
        expect(mounted).toBe(1);
    });

    it('still lets a refusal put the user back, even when the navigation was resolved twice', async () => {
        // The claim taken before the await has to be RELEASED when onBeforeLeave says no, or the
        // outlet would believe it had moved and refuse to re-enter the page it never left.
        newGate(false);

        navigate('/to');
        await settle(2);
        navigate('/to');
        await settle(2);

        gate.open();
        await settle();

        expect(currentPath(), 'a refused navigation must land back where it started').toBe('/from');
        expect(outletChildren(), 'the destination mounted behind a refusal').toEqual(['pdx-dr-from']);
        expect(mounted, 'the destination was constructed despite the refusal').toBe(0);
    });
});
