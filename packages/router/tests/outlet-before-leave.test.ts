// onBeforeLeave belongs to the OUTLET, not to either router.
//
// It is not a router capability. Neither router exports it: `outlet.ts:266` reads
// `_beforeLeaveCallbacks` off the OUTGOING element and, if a callback refuses, navigates back.
//
// So it is measured here, against the thing that implements it.
// `packages/core/tests/lifecycle-hooks.test.ts` covers the registration side — that calling
// `onBeforeLeave(fn)` pushes fn onto the element. This file covers whether anything ever
// CALLS it, which is the half that makes the feature exist.

import { describe, it, expect, beforeAll } from 'vitest';

// Registered BEFORE the outlet connects — autoInitRouter reads these on connect.
(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/editor', tag: 'pdx-leave-editor' },
    { path: '/elsewhere', tag: 'pdx-leave-elsewhere' },
];

/** What the page's onBeforeLeave callback answers. Flipped per test. */
let answer: boolean | 'destroy' = true;
/** How many times the outlet actually asked. A feature nobody calls is the defect here. */
let asked = 0;

class EditorPage extends HTMLElement {
    // The shape core's `onBeforeLeave` produces on a component element.
    _beforeLeaveCallbacks = [() => { asked++; return answer; }];
}
customElements.define('pdx-leave-editor', EditorPage);
customElements.define('pdx-leave-elsewhere', class extends HTMLElement {});

import { navigate, currentPath } from '../src/runtime';
import '../src/outlet'; // registers <pdx-router-outlet>

const tick = () => new Promise(r => setTimeout(r, 0));

describe('the outlet asks the page it is leaving', () => {
    beforeAll(async () => {
        history.replaceState(null, '', '/editor');
        document.body.appendChild(document.createElement('pdx-router-outlet'));
        await tick();
        navigate('/editor');
        await tick();
    });

    it('cancels the navigation when onBeforeLeave refuses', async () => {
        answer = false;
        asked = 0;

        navigate('/elsewhere');
        await tick();
        await tick();

        expect(asked, 'the outlet never asked — the hook is registered and unread').toBe(1);
        expect(currentPath(), 'a refused navigation must land back where it started').toBe('/editor');
        expect(document.querySelector('pdx-leave-elsewhere'),
            'the destination must not be mounted behind the refusal').toBeNull();
        expect(document.querySelector('pdx-leave-editor')).toBeTruthy();
    });

    it('lets it through when onBeforeLeave allows — the control', async () => {
        // Without this, an outlet that cancels EVERY navigation passes the case above.
        answer = true;
        asked = 0;

        navigate('/elsewhere');
        await tick();
        await tick();

        expect(asked).toBe(1);
        expect(currentPath()).toBe('/elsewhere');
        expect(document.querySelector('pdx-leave-elsewhere')).toBeTruthy();
    });
});
