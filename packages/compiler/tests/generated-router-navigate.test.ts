// One click must resolve one route.
//
// The generated router registers a Navigation API listener that intercepts every navigation and
// resolves it. `history.pushState` fires the Navigation API's `navigate` event, so a `navigate()`
// that pushed the URL and resolved the route by hand would, in Chrome, resolve every programmatic
// navigation twice.
//
// Both routers resolve a navigate() themselves — the before-hooks must run BEFORE the address bar
// is written, and the API's event arrives after — and write the URL with the listener muted, so
// their own pushState is not answered a second time. The router drift between dev and build is the
// same measurement: one navigate(), one resolution.
//
// Why it matters: `<pdx-router-outlet>._handleRouteChange` awaits `checkBeforeLeave` BEFORE it
// updates `_previousRoute`, so a second resolution reads a stale previous route, skips the
// same-route early return, and mounts the page again: one removal, TWO additions, two page
// elements of which only the first — the stale one — is visible. Clicking a second card changes
// the URL and nothing else.
//
// The module is evaluated rather than pattern-matched: a text assertion would pass on a router that
// says the right words and still resolves twice. `@pdxui/core` is not a dependency of this
// package, so signal/computed are stubbed — this counts navigations, it does not test reactivity.

import { describe, it, expect } from 'vitest';
import { generateOptimizedRouter } from '../src/plugin-utils';

interface Nav {
    navigate: (path: string, params?: Record<string, string>, state?: unknown) => void;
    onBeforeNavigate: (h: (from: string, to: string) => boolean | Promise<boolean>) => () => void;
    onAfterNavigate: (h: (from: string, to: string) => void) => () => void;
    destroyRouter: () => void;
}

/** Minimal signal/computed — enough to run the module, not enough to claim it tests reactivity. */
function coreStub(restores?: unknown[][]): Record<string, unknown> {
    const signal = (v: unknown) => {
        let value = v;
        const s = () => value;
        s.set = (n: unknown) => {
            value = typeof n === 'function' ? (n as (p: unknown) => unknown)(value) : n;
        };
        s.peek = () => value;
        return s;
    };
    return {
        signal,
        computed: (fn: unknown) => fn,
        sanitizeUrl: (u: string) => u,
        saveScrollPosition: () => { /* no scroll in this environment */ },
        // No scroll either; the arguments are recorded when a test asks, since isBack is what decides
        // between "back where it was" and "top".
        restoreScrollPosition: (...args: unknown[]) => { restores?.push(args); },
        // The generated router publishes the breadcrumb trail on every navigation.
        // A stub that does not answer for an import the module destructures makes the whole module
        // throw at load, and every test here then measures nothing.
        setRouteTrail: () => { /* the trail is measured in parity.test.ts */ },
        // The trail is drawn in an effect, and a label can be a dictionary key: the two imports
        // that come with it. Missing, every navigation throws inside `_publishTrail` and all nine
        // rows below read «the navigation was not observed at all».
        effect: (fn: () => void) => { fn(); return () => { /* nothing to dispose here */ }; },
        $t: (key: string) => key,
    };
}

interface Fixture {
    globals: Record<string, unknown>;
    pushes: string[];
    replaces: string[];
    apiNavigations: string[];
    /** A navigation the BROWSER starts — a plain link: the URL commits, then the event is answered. */
    linkTo: (url: string) => void;
    /**
     * A person clicks a plain link, in Chrome's order: the event is dispatched BEFORE the URL changes,
     * a listener may cancel it, and only an uncancelled one commits the URL and runs its handler.
     */
    click: (url: string) => void;
    /** Back or Forward: not cancellable, so the URL commits and the intercepted handler runs after. */
    traverse: (url: string) => void;
    /** A person clicks a same-origin <a download>: `downloadRequest` carries the file name. */
    download: (url: string, filename: string) => { prevented: boolean; intercepted: boolean };
}

/**
 * A browser that behaves like Chrome: `history.pushState` fires the Navigation API's `navigate`
 * event. That single fact is what turns an unconditional pushState into a second resolution, so
 * modelling it is the whole point of the fixture.
 */
function browserWithNavigationApi(): Fixture {
    const pushes: string[] = [];
    const replaces: string[] = [];
    const apiNavigations: string[] = [];
    const listeners: ((e: unknown) => void)[] = [];
    const loc = { pathname: '/a', search: '', hash: '' };

    const fire = (url: string): void => {
        const e = {
            canIntercept: true,
            hashChange: false,
            destination: { url: 'https://x' + url },
            intercept: (opts: { handler: () => void }) => { opts.handler(); },
        };
        for (const l of [...listeners]) l(e);
    };

    const navigation = {
        addEventListener: (_t: string, l: (e: unknown) => void) => { listeners.push(l); },
        removeEventListener: (_t: string, l: (e: unknown) => void) => {
            const i = listeners.indexOf(l);
            if (i >= 0) listeners.splice(i, 1);
        },
        navigate: (url: string) => {
            apiNavigations.push(url);
            loc.pathname = url.split('?')[0];
            fire(url);
        },
    };
    const history = {
        pushState: (_s: unknown, _t: string, url: string) => {
            pushes.push(url);
            loc.pathname = url.split('?')[0];
            fire(url);              // Chrome does this. So does the spec.
        },
        replaceState: (_s: unknown, _t: string, url: string) => {
            replaces.push(url);
            loc.pathname = url.split('?')[0];
            fire(url);
        },
        state: null,
    };
    const window = {
        navigation,
        history,
        location: loc,
        addEventListener: () => { /* the popstate path, unused while the API is present */ },
        removeEventListener: () => { /* destroyRouter unsubscribes through this */ },
    };
    const linkTo = (url: string): void => { loc.pathname = url.split('?')[0]; fire(url); };
    const click = (url: string): void => {
        let prevented = false;
        let handler: (() => void) | null = null;
        const e = {
            canIntercept: true,
            hashChange: false,
            cancelable: true,
            navigationType: 'push',
            userInitiated: true,
            formData: null,
            downloadRequest: null,
            destination: { url: 'https://x' + url },
            preventDefault: () => { prevented = true; },
            intercept: (opts: { handler: () => void }) => { handler = opts.handler; },
        };
        for (const l of [...listeners]) l(e);
        if (prevented) return;
        loc.pathname = url.split('?')[0];
        if (handler) (handler as () => void)();
    };
    const traverse = (url: string): void => {
        let handler: (() => void) | null = null;
        const e = {
            canIntercept: true,
            hashChange: false,
            cancelable: false,
            navigationType: 'traverse',
            userInitiated: true,
            formData: null,
            downloadRequest: null,
            destination: { url: 'https://x' + url },
            preventDefault: () => { /* a traversal cannot be cancelled here */ },
            intercept: (opts: { handler: () => void }) => { handler = opts.handler; },
        };
        for (const l of [...listeners]) l(e);
        loc.pathname = url.split('?')[0];
        if (handler) (handler as () => void)();
    };
    // A same-origin <a download>: the browser saves the file and the page stays, so nothing commits.
    const download = (url: string, filename: string): { prevented: boolean; intercepted: boolean } => {
        let prevented = false;
        let intercepted = false;
        const e = {
            canIntercept: true,
            hashChange: false,
            cancelable: true,
            navigationType: 'push',
            userInitiated: true,
            formData: null,
            downloadRequest: filename,
            destination: { url: 'https://x' + url },
            preventDefault: () => { prevented = true; },
            intercept: () => { intercepted = true; },
        };
        for (const l of [...listeners]) l(e);
        return { prevented, intercepted };
    };
    return { globals: { window, history, location: loc, navigation }, pushes, replaces, apiNavigations, linkTo, click, traverse, download };
}

/** Evaluate the generated ESM module in that browser and hand back the exports we drive. */
function loadRouter(env: Record<string, unknown>, restores?: unknown[][]): Nav {
    let src = generateOptimizedRouter([
        { path: '/a', tag: 'pdx-a', file: '/a.pdx' },
        { path: '/b', tag: 'pdx-b', file: '/b.pdx' },
    ] as never);
    src = src.replace(/^import \{([^}]*)\} from '@pdxui\/core';$/m, 'const {$1} = __core;');
    src = src.replace(/^export (function|const|let) /gm, '$1 ');
    src += '\nreturn { navigate, onBeforeNavigate, onAfterNavigate, destroyRouter };';

    const keys = ['__core', ...Object.keys(env)];
    const fn = new Function(...keys, src) as (...a: unknown[]) => Nav;
    return fn(coreStub(restores), ...Object.values(env));
}

describe('the generated router resolves one navigation once', () => {
    it('does not resolve twice where the Navigation API is present', () => {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);

        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));

        router.navigate('/b');

        expect(seen, 'the navigation was not observed at all — the probe is measuring nothing')
            .not.toEqual([]);
        expect(seen, 'one navigate() resolved the route more than once').toEqual(['/b']);
        router.destroyRouter();
    });

    it('still resolves once where the Navigation API is absent', () => {
        const env = browserWithNavigationApi();
        // The same fixture minus the API: pushState has nothing left to notify, so the module's
        // own resolution is the only one there is — and it must still happen.
        delete (env.globals.window as { navigation?: unknown }).navigation;
        delete (env.globals as { navigation?: unknown }).navigation;
        const history = env.globals.history as { pushState: (a: unknown, b: string, c: string) => void };
        history.pushState = (_a, _b, c) => { env.pushes.push(c); };

        const router = loadRouter(env.globals);
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));

        router.navigate('/b');

        expect(seen, 'without the Navigation API the navigation must still be resolved').toEqual(['/b']);
        expect(env.pushes, 'the address bar was never written').toContain('/b');
        router.destroyRouter();
    });
});

// A refused navigation leaves the address bar alone, under the Navigation API too.
// The parity table in packages/router measures this without the API (happy-dom has none); this
// fixture is the one that models it.
describe('the generated router, a before-hook that refuses, and the Navigation API', () => {
    const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0));

    it('a refused navigate() never writes the address bar', async () => {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));
        router.onBeforeNavigate(() => false);

        router.navigate('/b');
        await settle();

        expect([...env.pushes, ...env.apiNavigations], 'the URL was written before the hook refused').toEqual([]);
        expect((env.globals.location as { pathname: string }).pathname).toBe('/a');
        expect(seen).toEqual([]);
        router.destroyRouter();
    });

    it('an accepted navigate() writes it once and resolves once — the control', async () => {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));
        router.onBeforeNavigate(async () => true);

        router.navigate('/b');
        await settle();

        // Counted over both ways of writing it: which API writes the URL is not the behaviour.
        expect([...env.pushes, ...env.apiNavigations]).toEqual(['/b']);
        expect((env.globals.location as { pathname: string }).pathname).toBe('/b');
        expect(seen, 'our own write was answered as a second navigation').toEqual(['/b']);
        router.destroyRouter();
    });

    it('a plain link the hook refuses has the URL put back on the screen shown', async () => {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);
        await settle(); // the landing resolution, which records /a as the screen shown
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));
        router.onBeforeNavigate(() => false);

        env.linkTo('/b'); // the browser commits the URL, then asks the router
        await settle();

        expect(seen).toEqual([]);
        expect(env.replaces, 'the URL was left on the refused screen').toEqual(['/a']);
        expect((env.globals.location as { pathname: string }).pathname).toBe('/a');
        router.destroyRouter();
    });
});

// A clicked link asks BEFORE the address changes, as navigate() does — in the generated router too,
// which is what a production build runs. The runtime router has the same cases.
describe('the generated router: a clicked link asks first under the Navigation API', () => {
    const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0));
    const pathname = (env: Fixture): string => (env.globals.location as { pathname: string }).pathname;

    async function pendingLink(): Promise<{ env: Fixture; router: Nav; seen: string[]; answer: (v: boolean) => void }> {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);
        await settle(); // the landing resolution
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));
        let answer: (v: boolean) => void = () => {};
        router.onBeforeNavigate(() => new Promise<boolean>(r => { answer = r; }));
        env.click('/b');
        await settle();
        return { env, router, seen, answer: (v) => answer(v) };
    }

    it('while the hook is pending the address is still the page shown, and a refusal writes nothing', async () => {
        const { env, router, seen, answer } = await pendingLink();
        expect(pathname(env), 'the address moved while the question was open').toBe('/a');

        answer(false);
        await settle();
        expect(pathname(env)).toBe('/a');
        expect([...env.pushes, ...env.replaces], 'a refused link wrote the address bar').toEqual([]);
        expect(seen).toEqual([]);
        router.destroyRouter();
    });

    it('an accepted link writes the address once and resolves once', async () => {
        const { env, router, seen, answer } = await pendingLink();
        answer(true);
        await settle();
        expect(env.pushes).toEqual(['/b']);
        expect(pathname(env)).toBe('/b');
        expect(seen).toEqual(['/b']);
        router.destroyRouter();
    });
});

// Back restores the page's scroll under the Navigation API: a traversal is resolved as a Back, not as
// a new navigation, which would go to the top and bring a page left at 600 back at 0.
// Core does the scrolling; what the router decides is isBack, so that is what is read.
describe('the generated router: Back under the Navigation API', () => {
    const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0));

    it('a traversal restores as Back; a new navigation goes to the top — the control', async () => {
        const env = browserWithNavigationApi();
        const restores: unknown[][] = [];
        const router = loadRouter(env.globals, restores);
        await settle(); // the landing resolution

        router.navigate('/b');
        await settle();
        env.traverse('/a');
        await settle();

        const byPath = restores.map(([path, isBack]) => [path, isBack]);
        expect(byPath.slice(-2), 'the traversal to /a was restored as a new navigation').toEqual([['/b', false], ['/a', true]]);
        router.destroyRouter();
    });
});

// A before-hook that answers a boolean does not defer the navigation, in the generated router too:
// awaiting it would make every navigation asynchronous once any hook — the outlet's leave check — is
// registered. The runtime router has the same case.
describe('the generated router: a hook that answers synchronously', () => {
    const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0));

    it('true: the navigation resolves within the call', async () => {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);
        await settle(); // the landing resolution
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));
        router.onBeforeNavigate(() => true);
        router.navigate('/b');
        expect(seen, 'a boolean answer was awaited').toEqual(['/b']);
        router.destroyRouter();
    });

    it('the control: a hook that returns a promise is awaited', async () => {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);
        await settle();
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));
        router.onBeforeNavigate(async () => true);
        router.navigate('/b');
        expect(seen).toEqual([]);
        await settle();
        expect(seen).toEqual(['/b']);
        router.destroyRouter();
    });
});

// A same-origin <a download> is the browser's, not a route — in the generated router, which is what a
// @page app runs. Intercepted, `<a href="/components/badge" download>` would render the Badge page
// and save nothing. The runtime router has the same case.
describe('the generated router: a download link under the Navigation API', () => {
    const settle = (): Promise<void> => new Promise(r => setTimeout(r, 0));

    // A bare `download` attribute dispatches `downloadRequest: ""` (measured in Chromium): empty, and a
    // download all the same.
    for (const filename of ['', 'visits.csv']) {
        it(`download="${filename}" is neither intercepted nor cancelled, and resolves no route`, async () => {
            const env = browserWithNavigationApi();
            const router = loadRouter(env.globals);
            await settle(); // the landing resolution
            const seen: string[] = [];
            router.onAfterNavigate((_from, to) => seen.push(to));

            const outcome = env.download('/b', filename);
            await settle();
            expect(outcome, 'the router took the download over').toEqual({ prevented: false, intercepted: false });
            expect(seen).toEqual([]);
            router.destroyRouter();
        });
    }

    it('the control: the same click without download is the router\'s navigation', async () => {
        const env = browserWithNavigationApi();
        const router = loadRouter(env.globals);
        await settle();
        const seen: string[] = [];
        router.onAfterNavigate((_from, to) => seen.push(to));

        env.click('/b');
        await settle();
        expect(seen).toEqual(['/b']);
        router.destroyRouter();
    });
});
