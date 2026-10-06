/**
 * A scroll area must SCROLL. Geometry alone does not prove it.
 *
 * The manifest contract asserts the viewport's height against the declared cap, and it did
 * catch this defect — but only as a side effect. The property that was actually broken is not
 * expressible as a rectangle: `useScrollbar` wraps the viewport, and when the host declares
 * only a `max-height` the wrapper is *capped*, never *sized*. A percentage height resolves
 * against the parent's height, and against an `auto` parent it resolves to `auto` — so the
 * viewport grew to its full content, the wrapper's `overflow:hidden` clipped it, and the
 * viewport had nothing left to scroll: `scrollHeight === clientHeight`, `scrollTop` pinned at
 * 0. Everything past the cap was unreachable by any means. Measured before the fix:
 * wrapper 160px, viewport 288px, scrollTop 0.
 *
 * So this suite asserts the behaviour directly, on the rendered page, across every theme —
 * because the wrapper is built from computed style and a theme could reintroduce it.
 */
import { test, expect } from './contracts/fixture';
import { openPage } from './contracts/measure';

const PAGE = 'http://localhost:5220/generated/tier-6.html';
const SCENARIO = 'scroll-area-vertical';
const DECLARED_MAX = 160;

const THEMES = [
    'neutral', 'material', 'fluent', 'cupertino', 'metro', 'corporate', 'playful',
    'editorial', 'cyberpunk', 'glass', 'neumorphic', 'pragmatic', 'pragmatic-gold',
] as const;

interface Measured {
    viewportHeight: number;
    clientHeight: number;
    scrollHeight: number;
    scrolledTo: number;
    hostHeight: number;
}

async function measure(page: import('@playwright/test').Page, theme: string): Promise<Measured> {
    await openPage(page, `${PAGE}?scenario=${SCENARIO}&theme=${theme}`, { waitUntil: 'networkidle' });

    return page.evaluate(() => {
        const host = document.querySelector('section:not([hidden]) [data-test="scroll-area"]') as HTMLElement;
        const vp = host.querySelector('.pdx-scroll-area-viewport') as HTMLElement;
        vp.scrollTop = 9999;   // ask for the bottom; the DOM clamps to what is reachable
        return {
            viewportHeight: Math.round(vp.getBoundingClientRect().height),
            clientHeight: vp.clientHeight,
            scrollHeight: vp.scrollHeight,
            scrolledTo: vp.scrollTop,
            hostHeight: Math.round(host.getBoundingClientRect().height),
        };
    });
}

for (const theme of THEMES) {
    test(`[${theme}] scroll-area with max-height actually scrolls`, async ({ page }) => {
        const m = await measure(page, theme);

        // The scenario only means something if the content genuinely overflows the cap.
        // Without this the rest could pass on an empty box.
        expect(m.scrollHeight, 'content must exceed the cap for this to test anything')
            .toBeGreaterThan(DECLARED_MAX);

        // The scrolling element is the one that carries the cap.
        expect(m.clientHeight, 'viewport is capped, not grown to content')
            .toBeLessThanOrEqual(DECLARED_MAX + 3);

        // The defect, stated: reachable content past the fold.
        expect(m.scrolledTo, 'scrollTop must move — content past the cap has to be reachable')
            .toBeGreaterThan(0);
        expect(m.scrolledTo, 'must reach the very bottom')
            .toBe(m.scrollHeight - m.clientHeight);

        // And the host still honours the declared height, which is what made the breakage
        // invisible: the box looked right while its content was unreachable.
        expect(m.hostHeight).toBeLessThanOrEqual(DECLARED_MAX + 3);
    });
}
