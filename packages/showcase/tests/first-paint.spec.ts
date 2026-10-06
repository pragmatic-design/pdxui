/**
 * What the first paint actually waits for.
 *
 * The render-blocking stylesheet looks like the dominant term in the first paint, with three
 * candidate treatments — inline the foundation, split by route, defer what cannot be visible.
 * Measured on the production build, under Chromium with the network emulated, that premise is
 * **wrong for this app**, and the numbers are worth keeping:
 *
 *                              FCP median     entry JS arrives     stylesheet arrives
 *   as shipped                   632 ms            594 ms                532 ms
 *   stylesheet emptied           548 ms            513 ms                  —
 *
 *   (slow 4G: 1.6 Mbps, 150 ms RTT. Seven loads each, same machine, same commit.)
 *
 * Two things follow, and they decide it:
 *
 * 1. **The app's paint is gated by the JavaScript, not by the stylesheet.** Without the splash,
 *    `index.html`'s body is one empty custom element, so nothing of the app can be painted before
 *    the entry module runs — and FCP tracks the entry JS within 40 ms in both columns. The
 *    stylesheet already *finishes first* (532 ms against 594 ms): it is not delaying the paint, it
 *    is sharing the bandwidth.
 *
 *    ⚠️ The body also holds a SPLASH, and the first contentful paint is the splash, painted once
 *    the stylesheet is in and before the entry module (numbers at the assertion). The APP's own
 *    paint still follows the JavaScript; FCP does not measure it, and the alarm below reads when
 *    the splash leaves instead.
 *
 * 2. Removing **all** of the CSS buys 84 ms of 632, and buys it by freeing bandwidth — the JS
 *    arrives 81 ms earlier. So the three treatments all optimise BLOCKING, which is not what costs
 *    here. Inlining the foundation moves the same bytes into the HTML and frees none; deferring the
 *    overlays' styles risks a flash of unstyled dialog, for a slice of 84 ms. **The decision is not to defer the stylesheet**,
 *    and these tests are what will say so if someone tries.
 *
 * So what is ratcheted is the thing that does cost: the bytes a visitor must have before anything
 * can appear. That is the entry chunk plus the stylesheet, and it lives in `bundle-budget.spec.ts`
 * beside the other two. What lives here is the browser half — the ordering that makes the above
 * true, and the layout stability that a deferral would break.
 */
import { test, expect, type Page } from '@playwright/test';

/** Slow 4G, the profile Lighthouse throttles to: 1.6 Mbps down, 150 ms RTT. */
const SLOW_4G = {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
    connectionType: 'cellular4g' as const,
};

/**
 * An alarm, not an instrument. What it catches is a DOUBLED ENTRY — the kind of regression that comes
 * from putting a page's worth of modules back in it.
 *
 * Not the first contentful paint: that is the splash in `index.html`, which paints once the
 * stylesheet is in, before any JavaScript, and a doubled entry cannot move it. So it measures when
 * the splash LEAVES, the app ready with its first page. Measured, slow 4G, five fresh loads a
 * median:
 *
 *                                   app ready median     splash FCP median
 *   as shipped (entry 33.4 KB)       1059–1097 ms           740–752 ms      (10 medians, 4 workers)
 *   entry padded to 67.8 KB          1225–1267 ms           740–748 ms      (2 medians; runs 1214–1288)
 *
 * A doubled entry costs ~170 ms of ~1080, not twice the time: the entry is one download among the
 * first page's. So the ceiling sits between the two rows — ~100 ms over the shipped medians, 25 under
 * the lower padded one, and the padded build was measured red against it. It sits close to the
 * shipped figure: another machine's numbers will differ, and this is where it will say so first.
 */
const APP_READY_CEILING_MS = 1_200;

async function throttle(page: Page): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
}

interface Timings {
    /** The first contentful paint — the SPLASH's, before any JavaScript has run. */
    fcp: number;
    /**
     * When the splash starts to leave: the app is ready and its first page is under it.
     * The first moment of the load that the APP, not `index.html`, decides — and what an entry
     * grown by a page's worth of modules delays.
     */
    appReady: number;
    /** `responseEnd` of the entry module and of the stylesheet, from the page's own timeline. */
    entryJs: number;
    stylesheet: number;
    /** Cumulative layout shift, excluding shifts within 500 ms of a user input (there are none). */
    cls: number;
}

async function load(page: Page): Promise<Timings> {
    await page.addInitScript(() => {
        (window as unknown as { __cls: number }).__cls = 0;
        new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
                if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
            }
        }).observe({ type: 'layout-shift', buffered: true });
        // The splash's leave, read from the page's own clock: the class that starts its fade, or its
        // removal when there is no fade to run (`core/browser/splash.ts`).
        const w = window as unknown as { __appReady?: number };
        new MutationObserver((_, observer) => {
            const splash = document.getElementById('pdx-splash');
            const seen = document.body !== null && document.body.childElementCount > 0;
            if (w.__appReady === undefined && seen && (!splash || splash.classList.contains('pdx-splash-leaving'))) {
                w.__appReady = performance.now();
                observer.disconnect();
            }
        }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForFunction(() => performance.getEntriesByName('first-contentful-paint').length > 0,
        undefined, { timeout: 30_000 });
    await page.waitForFunction(() => (window as unknown as { __appReady?: number }).__appReady !== undefined,
        undefined, { timeout: 30_000 });
    // The app has to have rendered before the shift is read: a CLS sampled at `load` measures a
    // page that has not drawn anything yet, which is zero for the wrong reason.
    await expect(page.locator('.pdx-app-layout, pdx-app > *').first()).toBeVisible();
    await page.waitForTimeout(800);

    return page.evaluate(() => {
        const end = (match: RegExp): number => {
            // `PerformanceResourceTiming`, not `PerformanceEntry`: `responseEnd` is on the
            // resource timing and the base entry has no such property.
            const hit = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
                .find((r) => match.test(r.name));
            return hit ? Math.round(hit.responseEnd) : -1;
        };
        return {
            fcp: Math.round(performance.getEntriesByName('first-contentful-paint')[0].startTime),
            appReady: Math.round((window as unknown as { __appReady?: number }).__appReady ?? -1),
            entryJs: end(/\/assets\/index-[^/]*\.js$/),
            stylesheet: end(/\/assets\/index-[^/]*\.css$/),
            cls: (window as unknown as { __cls: number }).__cls,
        };
    });
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test.describe('the first paint, on a network that is not localhost', () => {
    test('the stylesheet is not what the paint is waiting for', async ({ page }) => {
        await throttle(page);
        const t = await load(page);

        expect(t.stylesheet, 'no entry stylesheet was requested — this test measured nothing')
            .toBeGreaterThan(0);
        expect(t.entryJs, 'no entry module was requested').toBeGreaterThan(0);

        // The fact the decision rests on. If this ever inverts, the stylesheet HAS become the
        // thing being waited for, and deferring it is worth measuring again.
        expect(t.stylesheet,
            `the stylesheet (${t.stylesheet}ms) now finishes after the entry module (${t.entryJs}ms): `
            + 'it has become the critical resource, and deferring it is worth measuring again')
            .toBeLessThanOrEqual(t.entryJs);

        // And the first paint follows the stylesheet. It is the SPLASH — text in `index.html`'s
        // body — painted as soon as the render-blocking stylesheet is in, before the entry module.
        // Not `fcp >= entryJs - 50`, the premise of an empty `<pdx-app>`: measured under slow 4G,
        // fcp − entryJs is −30…−59 ms sequential and −25…−55 four at a time, while fcp − stylesheet
        // is +13…+23 ms in all 40 loads. With the splash taken out of the HTML, the paint moves to
        // +683…+717 ms after the entry module: the splash is what paints first, not a clock.
        expect(t.fcp, `the first paint (${t.fcp}ms) came before the stylesheet (${t.stylesheet}ms) it is blocked on`)
            .toBeGreaterThanOrEqual(t.stylesheet);
    });

    test('nothing moves after it is painted', async ({ page }) => {
        // The trap: splitting a blocking stylesheet into non-blocking ones paints
        // a component unstyled and then moves it, which is worse than a slightly later paint. This
        // is the assertion that would catch it.
        await throttle(page);
        const t = await load(page);
        expect(t.cls, `cumulative layout shift is ${t.cls} — something was painted and then moved`)
            .toBeLessThan(0.02);
    });

    test('the app\'s first page has not doubled', async ({ browser }) => {
        test.setTimeout(120_000);
        const ready: number[] = [];
        const fcp: number[] = [];
        for (let i = 0; i < 5; i++) {
            // A FRESH context per run, and that is not ceremony: reusing one page warms the HTTP
            // cache and every load after the first measures a visitor who has already been here.
            // Measured — 620ms then 372, 364, 384, 368, which is a different question.
            const context = await browser.newContext();
            const fresh = await context.newPage();
            await throttle(fresh);
            const t = await load(fresh);
            ready.push(t.appReady);
            fcp.push(t.fcp);
            await context.close();
        }
        const m = median(ready);
        console.log(`[first-paint] slow 4G app ready median ${m}ms — runs ${ready.join(' ')} · splash FCP median ${median(fcp)}ms`);
        expect(m, `the app was ready at ${m}ms (median) against a ${APP_READY_CEILING_MS}ms alarm — runs ${ready.join(' ')}`)
            .toBeLessThanOrEqual(APP_READY_CEILING_MS);
    });
});
