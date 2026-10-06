// Back reaches the saved offset even when the page renders after the route resolves.
//
// One requestAnimationFrame after the route is published is not enough. The outlet mounts the page
// after that — a lazy import, then its components — so the container is often still short and the
// browser clamps the offset: in the showcase a page left at 600 comes back at 495 if nothing tries
// again. So the saved offset is re-applied as the content changes, until it fits, the user scrolls,
// another navigation starts, or two seconds pass.
//
// happy-dom has no layout, so `scrollTop` is never clamped there and any value sticks. The container
// here clamps like a browser: scrollTop stays within [0, scrollHeight - clientHeight], and the test
// decides how tall the content is. The same case runs in Chromium, with a real layout, in
// packages/responsive/tests/integration/ui-components/scroll-restore-late-content.spec.ts.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { saveScrollPosition, restoreScrollPosition } from '../src/browser/scroll';
import { waitUntil } from './wait-until';

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/** A scroll container that clamps like a browser, holding the outlet a page renders into. */
function clampingContainer(initialHeight: number) {
    let contentHeight = initialHeight;
    let top = 0;
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const outlet = document.createElement('div');
    scroller.appendChild(outlet);
    document.body.appendChild(scroller);
    const max = () => Math.max(0, contentHeight - 300);
    Object.defineProperty(scroller, 'clientHeight', { get: () => 300 });
    Object.defineProperty(scroller, 'scrollHeight', { get: () => contentHeight });
    Object.defineProperty(scroller, 'scrollTop', {
        get: () => top,
        set: (v: number) => { top = Math.min(Math.max(0, v), max()); },
    });
    return {
        scroller,
        outlet,
        /** The page's content arrives: the container grows, and the DOM changes as it does. */
        grow(height: number) {
            contentHeight = height;
            top = Math.min(top, max());
            const block = document.createElement('section');
            block.textContent = 'late content';
            outlet.appendChild(block);
        },
        /** Leave for a short page: the same container, now holding little. */
        shrink(height: number) {
            contentHeight = height;
            top = Math.min(top, max());
        },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

/**
 * The same case, the other way round: the page declares it opens at the TOP.
 *
 * On a traversal the browser has its own opinion — it re-anchors the offset it remembers as the
 * content arrives — and the restoring branch answers that by re-applying until it fits. The 'top'
 * branch does the same: written once, on a slow enough load the browser puts the page back where it
 * had been and the declaration loses. Measured in the showcase: `scrollTo(0, 0)` ran, and the next
 * scroll event read 300.
 *
 * Forward navigation keeps the single write: nothing is contending there.
 */
describe("@scroll 'top' on a traversal, against a browser that re-anchors", () => {
    it('holds the top while the page renders', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/ticket', c.outlet);

        c.shrink(400); // Back: the page has not rendered yet
        restoreScrollPosition('/ticket', true, c.outlet, 'top');
        expect(c.scroller.scrollTop, 'the declaration did not even reach the first write').toBe(0);

        // The browser re-anchors as the content lands — which is what the single write loses to.
        c.grow(2000);
        c.scroller.scrollTop = 600;

        await waitUntil(() => c.scroller.scrollTop === 0, "'top' held while the content arrived");
        expect(c.scroller.scrollTop).toBe(0);
    });

    it('a user wheel still wins: holding the top is not fighting the reader', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/ticket', c.outlet);

        c.shrink(400);
        restoreScrollPosition('/ticket', true, c.outlet, 'top');
        c.scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 200 }));
        c.grow(2000);
        c.scroller.scrollTop = 500; // where the wheel took it

        await frame();
        await frame();
        expect(c.scroller.scrollTop, 'it pulled the reader back to the top').toBe(500);
    });

    it('control \u2014 a FORWARD navigation writes once and stops', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        restoreScrollPosition('/ticket', false, c.outlet, 'top');
        expect(c.scroller.scrollTop).toBe(0);

        // Nothing contends a forward navigation, so nothing keeps watching: a page that scrolls
        // itself right after arriving is not being overridden.
        c.grow(2000);
        c.scroller.scrollTop = 400;
        await frame();
        await frame();
        expect(c.scroller.scrollTop, 'the hold outlived the case it exists for').toBe(400);
    });
});

describe('Back with content that arrives late', () => {
    it('reaches the saved offset once the page is tall enough', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/list', c.outlet);

        c.shrink(400); // the page left for, then Back: the list has not rendered yet
        restoreScrollPosition('/list', true, c.outlet);
        await frame();
        expect(c.scroller.scrollTop, 'the first frame clamps: the list is not there yet').toBe(100);

        c.grow(2000);
        await waitUntil(() => c.scroller.scrollTop === 600, 'the saved offset once the content grew');
        expect(c.scroller.scrollTop).toBe(600);
    });

    it('a user wheel during the growth stops it where the user put it', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/list', c.outlet);

        c.shrink(400);
        restoreScrollPosition('/list', true, c.outlet);
        await frame();
        c.scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -50 }));
        c.scroller.scrollTop = 40; // where the wheel took it

        c.grow(2000);
        await frame();
        await frame();
        expect(c.scroller.scrollTop, 'the restore overrode the user').toBe(40);
    });

    it('a new navigation stops it: the next page starts at the top and stays there', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/list', c.outlet);

        c.shrink(400);
        restoreScrollPosition('/list', true, c.outlet);
        await frame();
        restoreScrollPosition('/other', false, c.outlet); // the user clicked on before it finished
        expect(c.scroller.scrollTop).toBe(0);

        c.grow(2000);
        await frame();
        await frame();
        expect(c.scroller.scrollTop, 'the old restore pulled the new page down').toBe(0);
    });

    it('a navigation before the restore\'s frame cancels it too', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/list', c.outlet);
        c.scroller.scrollTop = 0;

        restoreScrollPosition('/list', true, c.outlet);
        restoreScrollPosition('/other', false, c.outlet); // same frame: the Back never landed
        await frame();
        expect(c.scroller.scrollTop, 'the cancelled Back still applied its offset').toBe(0);
    });

    it('gives up after two seconds, so a page that never grows cannot hold it open', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/list', c.outlet);

        c.shrink(400);
        const t0 = Date.now();
        restoreScrollPosition('/list', true, c.outlet);
        await frame();
        vi.spyOn(Date, 'now').mockReturnValue(t0 + 2100);

        c.grow(2000);
        await frame();
        await frame();
        expect(c.scroller.scrollTop, 'a restore still running after its cap').toBe(100);
    });

    it('the control: content already there is restored on the first frame, as before', async () => {
        const c = clampingContainer(2000);
        c.scroller.scrollTop = 600;
        saveScrollPosition('/list', c.outlet);
        c.scroller.scrollTop = 0;

        restoreScrollPosition('/list', true, c.outlet);
        await frame();
        expect(c.scroller.scrollTop).toBe(600);
    });
});
