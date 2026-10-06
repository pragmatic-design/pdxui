// The outlet carries a view-transition-name only while a view transition is running.
//
// An element with a view-transition-name is a STACKING CONTEXT. Carried permanently, every overlay an
// app declares inside a page — a drawer, a dialog — has its z-index scoped inside the outlet, and any
// shell region with a z-index of its own paints above it: a drawer at z-index 1000 under a header at
// 20 — its title hidden under the top bar, a double border, the backdrop not dimming the bar or the
// sidebar, and an app button covering the drawer's "Save".
//
// The stacking itself needs a real browser; this file pins the mechanism that causes it. The name has
// to be present when the transition is STARTED (the old snapshot) and until it FINISHES (the new one),
// and absent the rest of the time.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';

for (const tag of ['pdx-vtn-home', 'pdx-vtn-faded', 'pdx-vtn-plain']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-vtn-home' },
    { path: '/faded', tag: 'pdx-vtn-faded', transition: 'fade' },
    { path: '/plain', tag: 'pdx-vtn-plain' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (predicate: () => unknown, label: string, tries = 200): Promise<void> => {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await tick();
    }
    throw new Error(`gave up after ${tries} turns waiting for ${label}`);
};

/**
 * The name, read through BOTH channels.
 *
 * ⚠️ happy-dom does not know `viewTransitionName` as a style property: `el.style.viewTransitionName =
 * 'x'` leaves no CSS declaration (`getPropertyValue` returns '') and survives only as a plain JS
 * property on the style object. The first version of this helper read the declaration alone — and
 * "absent at rest" passed on the unfixed code, for the wrong reason. `setProperty` does produce a
 * declaration in happy-dom and in browsers, so the fix uses it; this helper still reads the JS property
 * too, so the old assignment cannot hide from the test.
 */
const vtName = (el: HTMLElement): string =>
    (el.style.getPropertyValue('view-transition-name')
        || (el.style as unknown as { viewTransitionName?: string }).viewTransitionName
        || '').trim();

let outlet: HTMLElement;

beforeAll(async () => {
    history.replaceState(null, '', '/');
    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await until(() => document.querySelector('pdx-vtn-home'), 'the home page to mount');
});

afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
});

describe('pdx-router-outlet view-transition-name', () => {
    it('is absent at rest, so an overlay inside a page is not trapped under the shell', () => {
        expect(vtName(outlet), 'the outlet is a stacking context with no transition running').toBe('');
    });

    it('is present while a transition runs, and gone once it finishes', async () => {
        // The control for the test above: "never set it" would pass it, and would silently kill the
        // page transitions the name exists for.
        let atStart = '';
        let inUpdate = '';
        let finish!: () => void;
        const finished = new Promise<void>((r) => { finish = r; });
        (document as unknown as { startViewTransition: unknown }).startViewTransition = (cb: () => void) => {
            atStart = vtName(outlet);
            cb();
            inUpdate = vtName(outlet);
            return { finished, updateCallbackDone: Promise.resolve(), ready: Promise.resolve() };
        };

        navigate('/faded');
        await until(() => document.querySelector('pdx-vtn-faded'), 'the faded page to mount');
        navigate('/plain'); // the transition belongs to the route being LEFT
        await until(() => document.querySelector('pdx-vtn-plain'), 'the plain page to replace it');

        expect(atStart, 'no name when the old snapshot is captured — the animation would not run').toBe('pdx-page');
        expect(inUpdate, 'no name when the new state is captured').toBe('pdx-page');
        expect(vtName(outlet), 'the name went away before the transition finished').toBe('pdx-page');

        finish();
        await until(() => vtName(outlet) === '', 'the name to be removed after the transition');
        expect(vtName(outlet)).toBe('');
    });

    it('is kept by a newer transition when an older one finishes after it started', async () => {
        // Two navigations in quick succession: the first transition's end must not strip the name
        // from the second, still running — or the second animates without its snapshot.
        const finishers: (() => void)[] = [];
        (document as unknown as { startViewTransition: unknown }).startViewTransition = (cb: () => void) => {
            cb();
            const finished = new Promise<void>((r) => finishers.push(r));
            return { finished, updateCallbackDone: Promise.resolve(), ready: Promise.resolve() };
        };

        navigate('/faded');
        await until(() => document.querySelector('pdx-vtn-faded'), 'the faded page to mount');
        navigate('/plain');                                   // transition #1 (leaving /faded)
        await until(() => document.querySelector('pdx-vtn-plain'), 'the plain page');
        navigate('/faded');
        await until(() => document.querySelector('pdx-vtn-faded'), 'the faded page again');
        navigate('/plain');                                   // transition #2
        await until(() => finishers.length === 2, 'the second transition to start');

        finishers[0]();                                       // the OLDER one ends first
        await tick(); await tick();
        expect(vtName(outlet), 'the older transition stripped the newer one\'s name').toBe('pdx-page');

        finishers[1]();
        await until(() => vtName(outlet) === '', 'the name to go when the newer one ends');
        expect(vtName(outlet)).toBe('');
    });

    it('is removed even when the transition fails', async () => {
        // `finished` rejects when a transition is skipped or aborted; the name must not stay behind.
        (document as unknown as { startViewTransition: unknown }).startViewTransition = (cb: () => void) => {
            cb();
            const finished = Promise.reject(new Error('skipped'));
            finished.catch(() => {});
            return { finished, updateCallbackDone: Promise.resolve(), ready: Promise.resolve() };
        };

        navigate('/faded');
        await until(() => document.querySelector('pdx-vtn-faded'), 'the faded page to mount');
        navigate('/plain');
        await until(() => document.querySelector('pdx-vtn-plain'), 'the plain page to replace it');

        await until(() => vtName(outlet) === '', 'the name to be removed after a failed transition');
        expect(vtName(outlet)).toBe('');
    });
});
