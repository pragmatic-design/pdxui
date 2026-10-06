// Lazy pages that load, lazy pages that fail, and the two transition paths.
//
// `outlet-lazy-race.test.ts` covers the superseded import. This file covers the
// ordinary case (the placeholder is replaced by the page), the failing one (the import rejects
// and the user is left staring at "Loading..." unless the outlet says otherwise), and the two
// ways a route can animate: View Transitions when the browser has them, CSS classes otherwise.

import { describe, it, expect, beforeAll, vi } from 'vitest';

for (const tag of ['pdx-lt-home', 'pdx-lt-faded', 'pdx-lt-plain']) {
    customElements.define(tag, class extends HTMLElement {});
}

(globalThis as Record<string, unknown>).__pdx_routes = [
    { path: '/', tag: 'pdx-lt-home' },
    { path: '/ok', tag: 'pdx-lt-loaded', lazy: true, file: '../tests/fixtures/lazy-ok.ts' },
    // The same module, already imported by the time this route is visited, under a tag it does not
    // define: the outlet still stands a placeholder in, and the import resolves in the same turn.
    { path: '/cached', tag: 'pdx-lt-cached', lazy: true, file: '../tests/fixtures/lazy-ok.ts' },
    { path: '/broken', tag: 'pdx-lt-missing', lazy: true, file: '../tests/fixtures/does-not-exist.ts' },
    { path: '/faded', tag: 'pdx-lt-faded', transition: 'fade' },
    { path: '/plain', tag: 'pdx-lt-plain' },
];

import { navigate } from '../src/runtime';
import '../src/outlet';

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Wait for the condition, not for a number of turns.
 *
 * A fixed number of microtask turns is no stand-in for "the dynamic import has resolved". Six
 * turns is enough on an idle machine and a bet on a loaded one: under the full `pnpm test` the
 * import may not have landed, and the assertion reads the placeholder, failing with
 * `the imported component never mounted`.
 *
 * Counts ATTEMPTS rather than reading a clock, which is deliberate: `suite-hygiene.test.ts`
 * forbids stopwatches in the default run. A count also stretches with the machine, where a
 * deadline expires against it.
 *
 * Throws naming what it waited for, so a page that never loads is distinguishable from one that
 * loaded into the wrong shape.
 */
const until = async (predicate: () => unknown, label: string, tries = 200): Promise<void> => {
    for (let i = 0; i < tries; i++) {
        if (predicate()) return;
        await tick();
    }
    throw new Error(`gave up after ${tries} turns waiting for ${label}`);
};
/**
 * Record the text of every node added under `target` from now on — the placeholder included, which
 * is TRANSIENT: a lazy import that resolves between two polls inserts it and replaces it before any
 * poll reads it, and `until(() => textContent includes 'Loading')` then waits for text that will not
 * come back. A mutation record keeps the added node after it is removed.
 *
 * The callback is held by `seen` for as long as the recorder is: happy-dom keeps it weakly.
 */
function recordAdded(target: Node): { texts: string[]; stop: () => void } {
    const texts: string[] = [];
    const callback: MutationCallback = (records) => {
        for (const r of records) for (const n of Array.from(r.addedNodes)) texts.push(n.textContent ?? '');
    };
    const observer = new MutationObserver(callback);
    observer.observe(target, { childList: true, subtree: true });
    const seen = { texts, callback, stop: () => observer.disconnect() };
    return seen;
}
let outlet: HTMLElement;

beforeAll(async () => {
    history.replaceState(null, '', '/');
    outlet = document.createElement('pdx-router-outlet');
    document.body.appendChild(outlet);
    await tick();
});

describe('a lazy page', () => {
    it('shows a placeholder and then replaces it with the loaded component', async () => {
        const added = recordAdded(outlet);
        navigate('/ok');
        // The placeholder is recorded when it is INSERTED, not polled: one tick is too early (the
        // navigation may not have reached `_activate`), and a poll bets that the import is still in
        // flight when it looks.
        await until(() => added.texts.some(t => t.includes('Loading')), 'the placeholder of the lazy page');
        added.stop();

        expect(added.texts.join(' | '), 'nothing told the user the page was coming').toContain('Loading');

        // The component being DEFINED is what proves the import ran. Waiting for the element alone
        // is not enough: an unknown tag is in the DOM like any other, so this test would pass with
        // the fixture emptied out.
        await until(() => customElements.get('pdx-lt-loaded'), 'the lazy module to register its component');

        expect(customElements.get('pdx-lt-loaded'), 'the lazy module never ran').toBeDefined();
        expect(document.querySelector('pdx-lt-loaded'), 'the imported component never mounted')
            .not.toBeNull();
        expect(outlet.textContent, 'the placeholder outlived the load').not.toContain('Loading');
    });

    it('a placeholder replaced within the same turn is still seen', async () => {
        // Its module is in the cache now: the import resolves in microtasks, and the placeholder is
        // inserted and replaced before a setTimeout-paced poll can look.
        // Polling `outlet.textContent` here gives up after 200 turns, every run.
        navigate('/');
        await until(() => outlet.querySelector('pdx-lt-home'), 'the home page');
        const added = recordAdded(outlet);
        navigate('/cached');
        await until(() => added.texts.some(t => t.includes('Loading')), 'the placeholder of the cached lazy page');
        added.stop();
        await until(() => outlet.querySelector('pdx-lt-cached'), 'the cached page to replace its placeholder');
    });

    it('says so, visibly and in the console, when the import fails', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        navigate('/broken');
        await until(() => outlet.querySelector('[role="alert"]'), 'the failure to reach the screen');

        const alert = outlet.querySelector('[role="alert"]');
        expect(alert, 'a failed import left "Loading..." on screen forever').not.toBeNull();
        expect(alert!.textContent).toContain('Failed to load page');
        expect(err.mock.calls.some((c) => String(c[0]).includes('Lazy load failed')),
            'the failure never reached the console').toBe(true);
        err.mockRestore();
    });

    it('does not take the import path when the component is already registered', async () => {
        // The second visit: the CE was defined by the first import, so there is nothing to fetch
        // and no placeholder should appear at all.
        navigate('/');
        await until(() => document.querySelector('pdx-lt-home'), 'the home page to mount');
        navigate('/ok');
        await tick();

        expect(outlet.textContent, 'a registered component was lazily imported again')
            .not.toContain('Loading');
        expect(document.querySelector('pdx-lt-loaded')).not.toBeNull();
    });
});

describe('transitions', () => {
    it('uses the View Transitions API when the browser has it', async () => {
        const startViewTransition = vi.fn((cb: () => void) => { cb(); return { finished: Promise.resolve() }; });
        (document as unknown as { startViewTransition?: unknown }).startViewTransition = startViewTransition;

        navigate('/faded');
        await until(() => document.querySelector('pdx-lt-faded'), 'the faded page to mount');
        // The transition belongs to the route being LEFT, so it takes effect on the way out.
        navigate('/plain');
        await until(() => document.querySelector('pdx-lt-plain'), 'the plain page to replace it');

        expect(startViewTransition, 'a route declaring a transition did not use the API')
            .toHaveBeenCalled();
        expect(document.querySelector('pdx-lt-plain')).not.toBeNull();
        expect(document.querySelector('pdx-lt-faded'), 'the old page survived the transition')
            .toBeNull();

        delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
    });

    it('falls back to the CSS classes when it does not', async () => {
        expect('startViewTransition' in document, 'the API stub was left behind').toBe(false);

        navigate('/faded');
        await until(() => document.querySelector('pdx-lt-faded'), 'the faded page to mount');
        const page = document.querySelector('pdx-lt-faded')!;
        expect(page).not.toBeNull();

        navigate('/plain');

        // Mid-flight: the outgoing page is still in the DOM, wearing the exit classes. Waiting for
        // the class rather than for one turn — it is applied as the exit starts and stays for the
        // whole animation, so there is a state to wait for and no reason to guess when.
        await until(() => page.className.includes('pdx-fade-out'), 'the exit animation to start');
        expect(page.className, 'the exit animation was never applied').toContain('pdx-fade-out');

        // animateExit falls back to a 500ms timer, so this genuinely is a duration — but the thing
        // being waited for is still the removal, and a loaded machine makes the timer late rather
        // than the removal optional.
        await until(() => !document.querySelector('pdx-lt-faded'), 'the faded page to leave', 2000);
        expect(document.querySelector('pdx-lt-faded'),
            'the page never left after its exit animation').toBeNull();
        expect(document.querySelector('pdx-lt-plain')).not.toBeNull();
    });

    it('a route with no transition swaps immediately', async () => {
        navigate('/');
        await tick();
        expect(document.querySelector('pdx-lt-plain'),
            'a page with no transition lingered after the navigation').toBeNull();
        expect(document.querySelector('pdx-lt-home')).not.toBeNull();
    });
});
