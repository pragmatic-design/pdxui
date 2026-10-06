// useScroll, scrollTo and the router's scroll restoration, driven directly rather than only through
// a running router.
//
// happy-dom moves window.scrollY on scrollTo() but emits no scroll event, so the listener is
// driven by dispatching one: the position is real, the notification is the part being stubbed.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useScroll, scrollTo, saveScrollPosition, restoreScrollPosition } from '../src/browser/scroll';
import { signal } from '../src/reactivity/signal';
import { waitUntil } from './wait-until';

/** Move the page and tell the listeners, the way a real scroll would. */
function scrollPageTo(y: number): void {
    window.scrollTo(0, y);
    window.dispatchEvent(new Event('scroll'));
}

beforeEach(() => {
    document.body.innerHTML = '';
    // Through the listener, not around it: useScroll() is a page-level singleton that keeps the
    // last Y it saw, so a silent reset would leave the next test comparing against a stale one.
    scrollPageTo(0);
});

describe('useScroll', () => {
    it('is a singleton — every caller reads the same state', () => {
        expect(useScroll()).toBe(useScroll());
    });

    it('follows the position', () => {
        const s = useScroll();
        scrollPageTo(240);
        expect(s.y()).toBe(240);
        expect(s.x()).toBe(0);
    });

    it('reports the direction, and settles back to idle', async () => {
        const s = useScroll();

        scrollPageTo(100);
        expect(s.direction()).toBe('down');
        expect(s.isScrolling()).toBe(true);

        scrollPageTo(50);
        expect(s.direction()).toBe('up');

        await waitUntil(() => s.isScrolling() === false, 'the scroll to be reported as ended');
        expect(s.isScrolling(), 'isScrolling never went back to false').toBe(false);
        expect(s.direction()).toBe('idle');
    });

    it('a scroll event that did not move the page keeps the previous direction', () => {
        const s = useScroll();
        scrollPageTo(300);
        expect(s.direction()).toBe('down');

        scrollPageTo(300);
        expect(s.direction(), 'a no-move event reset the direction').toBe('down');
    });

    it('the idle timer is restarted by each event, not stacked', async () => {
        const s = useScroll();
        scrollPageTo(10);
        await new Promise((r) => setTimeout(r, 100));
        scrollPageTo(20);
        await new Promise((r) => setTimeout(r, 100)); // SLEEP-OK: asserts the first timer did NOT end a continuing scroll, so the window must pass

        expect(s.isScrolling(), 'the first timer fired during a continuing scroll').toBe(true);
        await waitUntil(() => s.isScrolling() === false, 'the scroll to be reported as ended');
        expect(s.isScrolling()).toBe(false);
    });
});

// The window is the one thing that does NOT scroll in an app built on `pdx-app-layout`: the shell is
// `overflow: hidden` and `main.pdx-app-main` is `overflow-y: auto` (measured in skill-claims.spec.ts,
// case `who-scrolls`). A composable that can only watch the window therefore reports a `y` that never
// moves and a `direction` permanently `'idle'` in the shell this framework ships — silently, which is
// the part that costs the time.
describe('useScroll on a container', () => {
    /** Move an element and tell its listeners, the way a real scroll would. */
    function scrollElementTo(el: HTMLElement, top: number, left = 0): void {
        el.scrollTop = top;
        el.scrollLeft = left;
        el.dispatchEvent(new Event('scroll'));
    }

    function container(): HTMLElement {
        const el = document.createElement('main');
        document.body.appendChild(el);
        return el;
    }

    it('follows the element it was given, not the window', () => {
        const main = container();
        const s = useScroll(main);

        scrollElementTo(main, 240, 12);
        expect(s.y(), 'the container scrolled and y did not follow').toBe(240);
        expect(s.x()).toBe(12);
        expect(window.scrollY, 'the window was moved, which is not what was asked').toBe(0);
    });

    it('reports the direction of that element', async () => {
        const main = container();
        const s = useScroll(main);

        scrollElementTo(main, 100);
        expect(s.direction()).toBe('down');
        scrollElementTo(main, 40);
        expect(s.direction()).toBe('up');

        await waitUntil(() => s.direction() === 'idle', 'the container scroll to settle');
        expect(s.isScrolling()).toBe(false);
    });

    it('gives one state per element, and keeps it', () => {
        const a = container();
        const b = container();

        expect(useScroll(a), 'two calls for the same element built two states').toBe(useScroll(a));
        expect(useScroll(a), 'two elements share one state').not.toBe(useScroll(b));
        expect(useScroll(a), 'a container got the window state').not.toBe(useScroll());
    });

    it('does not move the window state', () => {
        const main = container();
        const page = useScroll();
        const s = useScroll(main);

        scrollElementTo(main, 300);
        expect(s.y()).toBe(300);
        expect(page.y(), 'scrolling a container moved the window state').toBe(0);
    });

    it('says so when the element is null instead of quietly watching the window', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // `useScroll(document.querySelector('main.pdx-app-main'))` before the shell mounts. Falling
        // back to the window without a word is the defect this suite guards, one level up.
        const s = useScroll(null);

        expect(s, 'a null target did not fall back to the window state').toBe(useScroll());
        expect(warn, 'the fallback happened in silence').toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0][0])).toContain('useScroll');
        warn.mockRestore();
    });
});

describe('scrollTo', () => {
    // The spy replaces the implementation rather than wrapping it: a real smooth scroll in
    // happy-dom settles asynchronously, and would arrive in the middle of a later test.
    it('a number scrolls the window, smoothly by default', () => {
        const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        scrollTo(500);
        expect(spy).toHaveBeenCalledWith({ top: 500, behavior: 'smooth' });
        spy.mockRestore();
    });

    it('honours the behaviour it is given', () => {
        const spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        scrollTo(500, { behavior: 'auto' });
        expect(spy).toHaveBeenCalledWith({ top: 500, behavior: 'auto' });
        spy.mockRestore();
    });

    it('a selector scrolls the element it matches into view', () => {
        const el = document.createElement('div');
        el.id = 'target';
        el.scrollIntoView = vi.fn();
        document.body.appendChild(el);

        scrollTo('#target');

        expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
    });

    it('a selector that matches nothing is a no-op, not a crash', () => {
        expect(() => scrollTo('#nothing-here')).not.toThrow();
    });

    it('an element is scrolled into view directly', () => {
        const el = document.createElement('div');
        el.scrollIntoView = vi.fn();
        scrollTo(el, { behavior: 'auto' });
        expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto' });
    });
});

describe('router scroll restoration', () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

    it('a back navigation returns to where the page was left', async () => {
        window.scrollTo(0, 420);
        saveScrollPosition('/list');

        window.scrollTo(0, 0);
        restoreScrollPosition('/list', true);
        await frame();

        expect(window.scrollY, 'going back landed at the top instead of where the user was')
            .toBe(420);
    });

    it('a back navigation to a path never saved leaves the page alone', async () => {
        window.scrollTo(0, 77);
        restoreScrollPosition('/never-visited', true);
        await frame();
        expect(window.scrollY).toBe(77);
    });

    it('a forward navigation goes to the top', async () => {
        window.scrollTo(0, 300);
        restoreScrollPosition('/anything', false);
        await frame();
        expect(window.scrollY).toBe(0);
    });

    it('a forward navigation with a hash scrolls to the anchor instead', async () => {
        const el = document.createElement('h2');
        el.id = 'section-2';
        el.scrollIntoView = vi.fn();
        document.body.appendChild(el);
        history.replaceState(null, '', '/page#section-2');

        restoreScrollPosition('/page', false);
        await frame();

        expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth' });
        history.replaceState(null, '', '/');
    });

    it('an encoded fragment is decoded before the lookup', async () => {
        const el = document.createElement('h2');
        el.id = 'a b';
        el.scrollIntoView = vi.fn();
        document.body.appendChild(el);
        history.replaceState(null, '', '/page#a%20b');

        restoreScrollPosition('/page', false);
        await frame();

        expect(el.scrollIntoView).toHaveBeenCalled();
        history.replaceState(null, '', '/');
    });

    it('a malformed fragment falls back to the top instead of throwing', async () => {
        // `#a..b` is not a valid CSS selector: querySelector throws on it, and an exception
        // inside a rAF callback is unhandled and takes the navigation down with it.
        history.replaceState(null, '', '/page#a..b');
        window.scrollTo(0, 250);

        restoreScrollPosition('/page', false);
        await frame();

        expect(window.scrollY, 'a bad anchor left the page where it was').toBe(0);
        history.replaceState(null, '', '/');
    });

    it('a fragment that is not valid percent-encoding does not throw either', async () => {
        // `decodeURIComponent('%')` throws a URIError, and the hash comes from the URL — user
        // input, decoded inside a requestAnimationFrame callback where nothing catches it. The
        // router's own copy of this function guards the same call, and so must this one.
        for (const bad of ['#%', '#%zz', '#a%E0%A4%A']) {
            history.replaceState(null, '', `/page${bad}`);
            window.scrollTo(0, 300);

            expect(() => restoreScrollPosition('/page', false), `${bad} threw`).not.toThrow();
            await frame();

            expect(window.scrollY, `${bad} left the page where it was`).toBe(0);
        }
        history.replaceState(null, '', '/');
    });

    it('a hash matching nothing scrolls to the top', async () => {
        history.replaceState(null, '', '/page#nowhere');
        window.scrollTo(0, 250);

        restoreScrollPosition('/page', false);
        await frame();

        expect(window.scrollY).toBe(0);
        history.replaceState(null, '', '/');
    });

    it('a bare "#" is not treated as an anchor', async () => {
        history.replaceState(null, '', '/page#');
        window.scrollTo(0, 250);

        restoreScrollPosition('/page', false);
        await frame();

        expect(window.scrollY).toBe(0);
        history.replaceState(null, '', '/');
    });
});

// `@scroll 'preserve' | 'top'` is parsed by the compiler, typed, completed by the LSP and
// documented; these cases prove the restoration reads it, so the declaration changes something.
//
// What the two values mean:
//
//   'top'       this page always enters at the top, even on Back. An explicit `#anchor` in the URL
//               still wins — the URL is more specific than a page default.
//   'preserve'  restore the saved offset even on a FORWARD navigation: you leave a long list, come
//               back to it through a link rather than the Back button, and you are where you were.
//               Without that reading the word describes what already happens on Back and the
//               declaration is a no-op by definition, which is the defect.
describe('the @scroll behaviour of a route', () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

    it("'top' enters at the top on a BACK navigation that has a saved offset", async () => {
        window.scrollTo(0, 500);
        saveScrollPosition('/always-top');
        window.scrollTo(0, 0);

        restoreScrollPosition('/always-top', true, null, 'top');
        await frame();
        expect(window.scrollY, 'the saved offset was restored on a page that asked for the top')
            .toBe(0);
    });

    it("'preserve' restores on a FORWARD navigation, which is the whole point of writing it", async () => {
        window.scrollTo(0, 360);
        saveScrollPosition('/long-list');
        window.scrollTo(0, 0);

        restoreScrollPosition('/long-list', false, null, 'preserve');
        await frame();
        expect(window.scrollY, 'a forward navigation ignored the saved offset').toBe(360);
    });

    it("'preserve' still goes to the top when there is nothing saved for that path", async () => {
        window.scrollTo(0, 200);
        restoreScrollPosition('/first-visit', false, null, 'preserve');
        await frame();
        expect(window.scrollY).toBe(0);
    });

    it('no declaration leaves both directions exactly as they were', async () => {
        window.scrollTo(0, 250);
        saveScrollPosition('/plain');
        window.scrollTo(0, 0);

        restoreScrollPosition('/plain', true);
        await frame();
        expect(window.scrollY, 'Back stopped restoring').toBe(250);

        window.scrollTo(0, 250);
        restoreScrollPosition('/plain', false);
        await frame();
        expect(window.scrollY, 'a forward navigation started restoring without being asked').toBe(0);
    });
});

// Eight of the nine element-watching composables take a GETTER — `useDrag(() => box(), …)`,
// `useSortable`, `useContainerSize`, `useRovingTabindex` — resolved inside an effect, so they attach
// themselves when a `:ref` signal fills at mount. `useScroll` takes one too: taking only the element,
// it would make the reader find a place where the element already exists.
describe('useScroll with a getter', () => {
    function scrollElementTo(el: HTMLElement, top: number): void {
        el.scrollTop = top;
        el.dispatchEvent(new Event('scroll'));
    }

    function container(): HTMLElement {
        const el = document.createElement('main');
        document.body.appendChild(el);
        return el;
    }

    it('attaches when the element arrives, which is what a :ref does at mount', async () => {
        // The real shape: `let box = $signal(null)` … `:ref="box"`. The getter reads the signal, so
        // the effect re-runs when the element is assigned. Taking the element instead means reading
        // `null` and watching nothing, for ever.
        const ref = signal<HTMLElement | null>(null);
        const s = useScroll(() => ref());
        expect(s.y(), 'there is nothing to watch yet').toBe(0);

        const main = container();
        ref.set(main);
        await Promise.resolve();

        scrollElementTo(main, 180);
        expect(s.y(), 'the element arrived and the composable never attached to it').toBe(180);
        expect(s.direction()).toBe('down');
    });

    it('follows the getter to a different element, and lets go of the old one', async () => {
        const first = container();
        const second = container();
        const ref = signal<HTMLElement | null>(first);
        const s = useScroll(() => ref());

        scrollElementTo(first, 100);
        expect(s.y()).toBe(100);

        ref.set(second);
        await Promise.resolve();
        scrollElementTo(second, 250);
        expect(s.y(), 'it never moved to the new element').toBe(250);

        scrollElementTo(first, 999);
        expect(s.y(), 'the old element still drives the state').toBe(250);
    });

    it('dispose() lets go', async () => {
        const main = container();
        const s = useScroll(() => main);
        scrollElementTo(main, 60);
        expect(s.y()).toBe(60);

        s.dispose();
        scrollElementTo(main, 400);
        expect(s.y(), 'the listener outlived dispose()').toBe(60);
    });

    it('a getter that never finds anything watches nothing, quietly', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const s = useScroll(() => null);

        expect(s.y()).toBe(0);
        // Unlike `useScroll(null)`, which IS a mistake worth naming: a getter that answers null is
        // the normal state before mount, and warning on it would cry wolf on every component.
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });

    it('leaves the element and the no-argument forms exactly as they were', () => {
        const main = container();
        expect(useScroll(main), 'the element form stopped being cached per element').toBe(useScroll(main));
        expect(useScroll(), 'the window singleton stopped being a singleton').toBe(useScroll());
        expect(useScroll(main)).not.toBe(useScroll());
    });
});
