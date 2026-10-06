// A refused navigation leaves the address bar alone — under the Navigation API.
//
// The parity table measures the history/popstate path, the only one happy-dom has. Chrome takes the
// other: handing the navigation to `window.navigation.navigate()` commits the URL, and hooks run
// inside `intercept` run after it. A refusal would keep the screen and move the URL, and a reload
// would then open the screen the hook had refused.
//
// The fixture below is the part of Chrome that matters: a `navigation` object whose `navigate` event
// fires for our own pushState/replaceState too. That is what makes "answer our own write" a second
// resolution, so the control checks it does not happen.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRouter, destroyRouter, navigate, currentPath, onBeforeNavigate, onAfterNavigate } from '../src/runtime';

const settle = (): Promise<void> => new Promise(r => setTimeout(r, 20));

interface Fixture {
    /** A person clicks a plain link: the browser asks first, and commits the URL only if nobody cancelled. */
    click(url: string): void;
    /** A person clicks a same-origin <a download>: `downloadRequest` carries the file name. */
    download(url: string, filename: string): Outcome;
    /** Back or Forward: not cancellable, so the URL commits and the event is answered after. */
    traverse(url: string): void;
    uninstall(): void;
}

interface EventInit { navigationType: 'push' | 'replace' | 'traverse'; cancelable: boolean; userInitiated: boolean; downloadRequest?: string | null }
/** What the listeners did with the event. */
interface Outcome { prevented: boolean; intercepted: boolean }

function installNavigationApi(): Fixture {
    const listeners: ((e: unknown) => void)[] = [];
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    // Chrome's order: the event is dispatched BEFORE the URL changes. A listener may cancel it, if it
    // is cancelable, or intercept it — and an intercepted navigation commits the URL when the
    // dispatch ends, then runs the handler.
    const dispatch = (url: string, init: EventInit, commit: () => void): Outcome => {
        let prevented = false;
        let handler: (() => unknown) | null = null;
        const e = {
            canIntercept: true,
            hashChange: false,
            formData: null,
            downloadRequest: null,
            ...init,
            destination: { url: new URL(url, location.origin).href },
            preventDefault: () => { if (e.cancelable) prevented = true; },
            intercept: (opts: { handler: () => unknown }) => { handler = opts.handler; },
        };
        for (const l of [...listeners]) l(e);
        if (prevented) return { prevented, intercepted: handler !== null };
        commit();
        if (handler) void (handler as () => unknown)();
        return { prevented, intercepted: handler !== null };
    };
    const script = (type: 'push' | 'replace'): EventInit => ({ navigationType: type, cancelable: true, userInitiated: false });
    Object.defineProperty(window, 'navigation', {
        configurable: true,
        writable: true,
        value: {
            addEventListener: (_t: string, l: (e: unknown) => void) => { listeners.push(l); },
            removeEventListener: (_t: string, l: (e: unknown) => void) => {
                const i = listeners.indexOf(l);
                if (i >= 0) listeners.splice(i, 1);
            },
            navigate: (url: string) => dispatch(url, script('push'), () => push(null, '', url)),
        },
    });
    // Chrome does this, and so does the spec: a same-document write fires `navigate`.
    history.pushState = ((s: unknown, t: string, u?: string | URL | null) => dispatch(String(u), script('push'), () => push(s, t, u))) as History['pushState'];
    history.replaceState = ((s: unknown, t: string, u?: string | URL | null) => dispatch(String(u), script('replace'), () => replace(s, t, u))) as History['replaceState'];
    return {
        click: (url) => { dispatch(url, { navigationType: 'push', cancelable: true, userInitiated: true }, () => push(null, '', url)); },
        // A download stays on the page: the browser saves the file, and no URL is committed.
        download: (url, filename) => dispatch(url, { navigationType: 'push', cancelable: true, userInitiated: true, downloadRequest: filename }, () => {}),
        traverse: (url) => dispatch(url, { navigationType: 'traverse', cancelable: false, userInitiated: true }, () => replace(null, '', url)),
        uninstall: () => {
            history.pushState = push;
            history.replaceState = replace;
            Reflect.deleteProperty(window, 'navigation');
        },
    };
}

const ROUTES = [
    { path: '/a', component: () => document.createElement('div') },
    { path: '/b', component: () => document.createElement('div') },
];

let api: Fixture;
const offs: (() => void)[] = [];

beforeEach(async () => {
    history.replaceState(null, '', '/a');
    api = installNavigationApi();
    createRouter(ROUTES);
    await settle();
});
afterEach(() => {
    for (const off of offs.splice(0)) off();
    destroyRouter();
    api.uninstall();
});

describe('runtime router under the Navigation API — a before-hook that refuses', () => {
    it('a refused navigate() never writes the address bar', async () => {
        const before = history.length;
        offs.push(onBeforeNavigate(() => false));
        navigate('/b');
        await settle();
        expect(currentPath()).toBe('/a');
        expect(location.pathname, 'the URL moved to a screen that was never reached').toBe('/a');
        expect(history.length).toBe(before);
    });

    it('an accepted navigate() writes it once and resolves once — the control', async () => {
        const seen: string[] = [];
        offs.push(onAfterNavigate((_from, to) => seen.push(to)));
        offs.push(onBeforeNavigate(async () => true));
        navigate('/b');
        await settle();
        expect(location.pathname).toBe('/b');
        expect(seen, 'our own pushState was answered as a second navigation').toEqual(['/b']);
    });

    it('a plain link the hook refuses leaves the URL on the screen shown', async () => {
        offs.push(onBeforeNavigate(() => false));
        api.click('/b');
        await settle();
        expect(currentPath()).toBe('/a');
        expect(location.pathname, 'the link was refused and the URL stayed on it').toBe('/a');
    });
});

// A clicked link asks BEFORE the address changes, as navigate() does.
//
// Intercepting the event commits the URL as soon as the dispatch ends, and runs the hooks after. So
// while "leave with unsaved work?" is on screen, the address bar would already name the destination,
// and a refusal would put it back. The test above only reads the URL after the answer. These read it while the
// question is open, which is when a person looks at it.
describe('runtime router under the Navigation API — a clicked link asks first', () => {
    /** A before-hook that stays pending until the test answers it. */
    function pendingHook(): (answer: boolean) => void {
        let answer: (v: boolean) => void = () => {};
        offs.push(onBeforeNavigate(() => new Promise<boolean>(r => { answer = r; })));
        return (v) => answer(v);
    }

    it('while the hook is pending the address is still the page shown; a refusal adds no entry', async () => {
        const answer = pendingHook();
        const before = history.length;
        api.click('/b');
        await settle();
        expect(location.pathname, 'the address moved while the question was open').toBe('/a');

        answer(false);
        await settle();
        expect(location.pathname).toBe('/a');
        expect(currentPath()).toBe('/a');
        expect(history.length, 'a refused link left an entry in the history').toBe(before);
    });

    it('an accepted link writes the address once, with one new entry, and resolves once', async () => {
        const seen: string[] = [];
        offs.push(onAfterNavigate((_from, to) => seen.push(to)));
        const answer = pendingHook();
        const before = history.length;
        api.click('/b?tab=2');
        await settle();
        expect(location.pathname).toBe('/a');

        answer(true);
        await settle();
        expect(location.pathname).toBe('/b');
        expect(location.search, 'the query of the link was lost').toBe('?tab=2');
        expect(history.length).toBe(before + 1);
        expect(seen).toEqual(['/b']);
    });

    it('Back under a refusing hook still ends on the page shown — the control', async () => {
        // A traversal cannot be cancelled: its URL has moved before the router is asked, and a
        // refusal puts it back. That is the behaviour the recipe describes for Back.
        offs.push(onBeforeNavigate(() => false));
        api.traverse('/b');
        await settle();
        expect(currentPath()).toBe('/a');
        expect(location.pathname).toBe('/a');
    });

    it('a pushState from other code is not cancelled — the control', () => {
        // Only a person's click is taken over. Code that writes history itself expects the URL to
        // change when the call returns.
        history.pushState(null, '', '/b?x=1');
        expect(location.pathname).toBe('/b');
        expect(location.search).toBe('?x=1');
    });
});

// Back restores the page's scroll under the Navigation API too.
//
// The parity table measures restoration on popstate, the only path happy-dom has. In Chrome, Back is
// a `traverse` event, and a listener that resolves it as a new navigation brings the page back at the
// top.
describe('runtime router under the Navigation API — Back restores the scroll', () => {
    const raf = (): Promise<void> => new Promise(r => requestAnimationFrame(() => r()));

    it('a traversal back lands where the page was left; a new navigation starts at the top', async () => {
        window.scrollTo(0, 250);
        navigate('/b');
        await settle();
        expect(window.scrollY, 'a new navigation starts at the top').toBe(0);

        api.traverse('/a');
        await settle();
        await raf();
        expect(currentPath()).toBe('/a');
        expect(window.scrollY, 'Back must land where the page was left').toBe(250);
    });
});

// A same-origin <a download> is the browser's, not a route.
//
// A download that falls through to the generic branch is intercepted: in Chromium,
// `<a href="/components/badge" download>` would render the Badge page and save nothing, and with a
// real file the app would show its 404.
describe('runtime router under the Navigation API — a download link', () => {
    // `downloadRequest` is the file name, and a bare `download` attribute gives an EMPTY one: in
    // Chromium, `<a href download>` dispatches `downloadRequest: ""`. Empty is falsy, so a check on
    // its truth reads a download as a link click. A download is a string, empty or not.
    for (const filename of ['', 'visits.csv']) {
        it(`download="${filename}" is neither intercepted nor cancelled, and the route stays`, async () => {
            const outcome = api.download('/b', filename);
            await settle();
            expect(outcome, 'the router took the download over').toEqual({ prevented: false, intercepted: false });
            expect(currentPath()).toBe('/a');
        });
    }

    it('the control: the same click without download is the router\'s navigation', async () => {
        api.click('/b');
        await settle();
        expect(currentPath()).toBe('/b');
        expect(location.pathname).toBe('/b');
    });
});
