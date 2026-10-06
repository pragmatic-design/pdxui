// Navigating AWAY while a lazy page's import() is still pending must not let the
// resolved import clobber `activeElement`. If the import's .then() set
// activeElement = element unconditionally, the stale element would be detached (its
// placeholder already removed), so the REAL active page could never be removed
// again — it would get stranded in the DOM on the next navigation.

import { describe, it, expect, beforeAll } from 'vitest';

let gateResolve!: () => void;
(globalThis as Record<string, unknown>).__lazyGate = new Promise<void>(res => { gateResolve = res; });

class HomePage extends HTMLElement {}
class OtherPage extends HTMLElement {}
class FinalPage extends HTMLElement {}
customElements.define('pdx-homepage', HomePage);
customElements.define('pdx-otherpage', OtherPage);
customElements.define('pdx-finalpage', FinalPage);

// The lazy route CE is NOT registered yet → outlet takes the import() path.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-homepage' },
    { path: '/lazy', tag: 'pdx-lazypage', lazy: true, file: '../tests/fixtures/lazy-page.ts' },
    { path: '/other', tag: 'pdx-otherpage' },
    { path: '/final', tag: 'pdx-finalpage' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise(r => setTimeout(r, 0));

describe('router — lazy import navigate-away race',() => {
    beforeAll(async () => {
        history.replaceState(null, '', '/');
        const outlet = document.createElement('pdx-router-outlet');
        document.body.appendChild(outlet);
        await tick();
    });

    it('drops a superseded lazy import so the active page is not stranded', async () => {
        // Start navigating to the lazy page → placeholder shown, import() pending on the gate.
        navigate('/lazy');
        await tick();
        await tick();

        // Sanity: the lazy branch is active (placeholder shown, import pending on the gate).
        const outletEl = document.querySelector('pdx-router-outlet')!;
        expect(outletEl.textContent).toContain('Loading');

        // Navigate away BEFORE the import resolves. Now 'other' is the active page.
        navigate('/other');
        await tick();
        await tick();

        // Let the superseded lazy import resolve — it must be discarded (not clobber activeElement).
        gateResolve();
        await tick();
        await tick();
        await tick();

        // Navigate once more. This deactivates the CURRENT active page. If the stale import
        // clobbered activeElement, 'other' is never removed and remains stranded.
        navigate('/final');
        await tick();
        await tick();

        const outlet = document.querySelector('pdx-router-outlet')!;
        expect(outlet.querySelector('pdx-finalpage')).toBeTruthy();
        expect(outlet.querySelector('pdx-otherpage')).toBeNull(); // must NOT be stranded
        expect(outlet.querySelector('pdx-lazypage')).toBeNull();
        expect(outlet.textContent).not.toContain('Loading');
    });
});
