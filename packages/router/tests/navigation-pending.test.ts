// `navigation.pending()` and `navigation.to()` (#149): between a click and the new route, the
// application can see that a navigation is in progress — and where it is going — without wiring
// the router's hooks by hand. True once the before-hooks have accepted (the URL commit), false when
// the route is published or the navigation is refused, denied or abandoned; a newer navigation
// replaces the target.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    createRouter, destroyRouter, navigate, navigation, currentPath, registerGuardChecker, onBeforeNavigate,
} from '../src/runtime';

const page = () => document.createElement('div');
const flush = () => new Promise(r => setTimeout(r, 0));

/** A loader that resolves when the test says so. */
function gate() {
    let open!: () => void;
    const done = new Promise<void>(r => { open = r; });
    return { loader: () => done.then(() => ({})), open };
}

describe('navigation.pending() / navigation.to()', () => {
    beforeEach(() => {
        history.replaceState(null, '', '/');
        registerGuardChecker(() => true);
    });
    afterEach(() => destroyRouter());

    it('is true from navigate() until the route is published, with the target in to()', async () => {
        const slow = gate();
        createRouter([{ path: '/', component: page }, { path: '/slow', component: page, loader: slow.loader }]);
        await flush();
        expect(navigation.pending()).toBe(false);
        expect(navigation.to()).toBeNull();

        navigate('/slow?tab=2');
        expect(navigation.pending()).toBe(true);
        expect(navigation.to()).toBe('/slow?tab=2');
        expect(currentPath()).toBe('/'); // not published yet

        slow.open();
        await flush();
        expect(currentPath()).toBe('/slow');
        expect(navigation.pending()).toBe(false);
        expect(navigation.to()).toBeNull();
    });

    it('a newer navigation replaces the target, and the superseded one does not clear it', async () => {
        const a = gate();
        const b = gate();
        createRouter([
            { path: '/', component: page },
            { path: '/a', component: page, loader: a.loader },
            { path: '/b', component: page, loader: b.loader },
        ]);
        await flush();

        navigate('/a');
        navigate('/b');
        expect(navigation.to()).toBe('/b');

        a.open(); // the abandoned navigation finishes first
        await flush();
        expect(navigation.pending()).toBe(true);
        expect(navigation.to()).toBe('/b');

        b.open();
        await flush();
        expect(currentPath()).toBe('/b');
        expect(navigation.pending()).toBe(false);
    });

    it('is false after a guard denies the route', async () => {
        let answer!: (v: boolean) => void;
        registerGuardChecker(() => new Promise<boolean>(r => { answer = r; }));
        createRouter([{ path: '/', component: page }, { path: '/admin', component: page, guard: 'admin' }]);
        await flush();

        navigate('/admin');
        expect(navigation.pending()).toBe(true);
        answer(false);
        await flush();
        expect(navigation.pending()).toBe(false);
        expect(navigation.to()).toBeNull();
    });

    it('is false when a before-hook refuses a navigation that replaced a pending one', async () => {
        const slow = gate();
        createRouter([
            { path: '/', component: page },
            { path: '/slow', component: page, loader: slow.loader },
            { path: '/stay', component: page },
        ]);
        await flush();
        const off = onBeforeNavigate((_from, to) => to !== '/stay');

        navigate('/slow');
        expect(navigation.pending()).toBe(true);
        navigate('/stay'); // refused: /slow is abandoned and nothing replaces it
        await flush();
        expect(navigation.pending()).toBe(false);

        slow.open();
        await flush();
        expect(navigation.pending()).toBe(false);
        off();
    });

    it('is not pending while a before-hook is still deciding', async () => {
        let decide!: (v: boolean) => void;
        createRouter([{ path: '/', component: page }, { path: '/form', component: page }]);
        await flush();
        const off = onBeforeNavigate(() => new Promise<boolean>(r => { decide = r; }));

        navigate('/form');
        expect(navigation.pending()).toBe(false); // "leave this page?" is on screen, nothing loads
        decide(true);
        await flush();
        expect(currentPath()).toBe('/form');
        expect(navigation.pending()).toBe(false);
        off();
    });

    it('is false after a navigation that matches nothing', async () => {
        createRouter([{ path: '/', component: page }]);
        await flush();
        navigate('/nowhere');
        await flush();
        expect(navigation.pending()).toBe(false);
        expect(navigation.to()).toBeNull();
    });
});
