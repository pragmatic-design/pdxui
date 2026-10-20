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
import { test, expect, type Page } from './fixture';
import { throttle, lcpOf, medianLcp } from './lcp';

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
 *   as shipped (entry 34.6 KB)        884–889 ms            720–732 ms      (6 medians, 4 workers)
 *   entry padded by 34.2 KB          1046–1047 ms           728–732 ms      (2 medians; runs 1030–1065)
 *
 * Re-measured 2026-10-09 (#31). The first page had drifted to 1157–1182 ms against a table that
 * said 1059–1097: its route stylesheets were found only after the entry ran, and Vite's loader waits
 * for them before the page mounts — a whole extra wave. The HTML now announces them
 * (`routePreloadFiles`, and `first-paint-waves.spec.ts` checks they start with the entry), which took
 * ~290 ms off. With the page that much faster a doubled entry stayed under the old 1200 ms ceiling,
 * so the alarm had gone blind; it is placed again between the two rows: ~111 ms over the shipped
 * medians, 46 under the padded ones, which are red against it. Another machine's numbers will
 * differ, and this is where it will say so first.
 *
 * And it did, on CI (#517). The medians CI recorded on 32 runs of 2026-10-17/18, none of which
 * touched the first page, spread from 898 to 1013 ms (typical 957): the 1000 ms alarm sat inside
 * that spread and went red twice, once on main. Re-measured locally the same day, entry 39.5 KB:
 *
 *                                   app ready median
 *   as shipped                        926–933 ms            (4 medians)
 *   entry doubled (+34 KB gzipped)   1097–1111 ms           (4 medians, all red)
 *
 * CI runs ~27 ms slower than this machine, so a doubled entry there should land around 1070–1185.
 * The alarm sits between the two: 27 ms over the highest unchanged CI median, ~30 under the lowest
 * doubled estimate, 57 under the doubled medians measured here.
 */
const APP_READY_CEILING_MS = 1_040;

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
    await expect(page.locator('.pdx-app-layout, app-app > *').first()).toBeVisible();
    await page.waitForTimeout(800);

    // A cold load or nothing: an entry served from the HTTP cache measures a returning visitor, and
    // every number below would be the wrong one. The fixture reuses a context per worker (#32), so
    // this is what says whether it also reused its cache.
    // Downloaded means more bytes on the wire than the body: headers on top of it. A 304 moves only
    // headers, and the memory cache moves nothing.
    const entry = await page.evaluate(() => {
        const r = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
            .find((e) => /\/assets\/index-[^/]*\.js$/.test(e.name));
        return r ? { wire: r.transferSize, body: r.encodedBodySize } : null;
    });
    expect(entry, 'the entry module was not fetched at all').not.toBeNull();
    expect(entry!.wire, `the entry module came from the HTTP cache (${entry!.wire} bytes on the wire for a `
        + `${entry!.body}-byte body): this is not a cold load`).toBeGreaterThan(entry!.body);

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

/**
 * When each route's main content paints (#251). «App ready» says when the splash leaves; a page whose
 * largest element is a list or a record can be ready and still have its content arrive later. So
 * three routes, cold, under the same slow 4G, read the Largest Contentful Paint, and the LCP element
 * has to be inside the route's own page: an LCP that is the shell's measures the shell, and the test
 * says so instead of passing.
 *
 * A budget of null is reported and not held: that is how the first CI run measured. Each budget is
 * the highest measurement + 10%, rounded up to 50 ms. Highest of the first CI run and the local ones,
 * because this spec runs in the pre-push gate too, where a laptop measured about 5% over the runner.
 * Measured 2026-10-14, slow 4G, cold:
 *
 *                 CI (one run)    local (three runs, and the pre-push gate)    budget
 *   /                 908 ms          952, 956, 952, 948 ms                    1100 ms
 *   /tickets         3700 ms          3908, 3952, 3916, 3872 ms                4350 ms
 *   /tickets/1       1776 ms          1852, 1876, 1864, 1884 ms                2100 ms
 *
 * `/tickets` painted three seconds after the app was ready: its route's ~60 modules shared the slow
 * link before the page mounted. Since #449 the page defers what an action opens — the create modal,
 * the record drawer and its question, the inline editor — to the first idle moment after it mounts,
 * and it paints at 2924, 2944, 2956, 2960 ms locally (2960 + 10% → 3300).
 *
 * `/tickets/1` reads its record from the server since #507 (`@loader ticket: loadTicket;`), where it
 * read it from the store in its own chunk: a cold load waits for one more request before the page
 * mounts. Measured 2026-10-20 locally, two runs of three: 2228, 2184, 2216 and 2216, 2192, 2228 ms
 * (2228 + 10% → 2500), against 1852–1884 ms before. The owner accepted the round trip as the cost of
 * a page that loads its data.
 *
 * Since #464 a route is judged on the median of three cold loads (`medianLcp`): one load on a shared
 * runner was a sample, and the HTTP/2 spec failed `/` on one at 1128 ms where the same code measured
 * 948 and 1000. The budgets are the ones above, set against single loads: the median only takes the
 * outliers out.
 *
 * These are the HTTP/1.1 numbers: the preview server's six connections are most of what is left
 * on `/tickets`. The same routes over HTTP/2, the number a real host gives and #407's target, are
 * held in `first-paint-http2.spec.ts`; these stay as the second, looser number.
 */
const LCP_ROUTES: { route: string; root: string; budgetMs: number | null }[] = [
    { route: '/', root: 'dashboard', budgetMs: 1100 },
    { route: '/tickets', root: 'tickets', budgetMs: 3300 },
    { route: '/tickets/1', root: 'ticket', budgetMs: 2500 },
];

test.describe('each route\'s main content paints within its budget', () => {
    for (const { route, root, budgetMs } of LCP_ROUTES) {
        test(`LCP of ${route} is inside its page, and within its budget`, async ({ browser, baseURL, storageState, locale }) => {
            // Judged on the median of LCP_RUNS cold loads (#464), each in a context of its own, signed in
            // as the suite's are: the fixture's context keeps its connections between tests, and a load
            // that reuses them is not cold.
            const { median: lcp, all } = await medianLcp(async () => {
                const context = await browser.newContext({ baseURL, storageState, locale });
                const run = await lcpOf(await context.newPage(), route, root);
                await context.close();
                expect(run.ms, `no largest-contentful-paint entry for ${route}`).toBeGreaterThan(0);
                expect(run.insidePage, `the LCP of ${route} is ${run.element}, not inside [data-test="${root}"]: it measures the shell, not the page`)
                    .toBe(true);
                return run;
            });
            console.log(`[first-paint] slow 4G LCP ${route}: median ${lcp.ms}ms — runs ${all.map((r) => r.ms).join(' ')} (${lcp.element})${budgetMs === null ? ' — no budget yet' : ` against ${budgetMs}ms`}`);
            if (budgetMs !== null) {
                expect(lcp.ms, `the median LCP of ${route} is ${lcp.ms}ms (runs ${all.map((r) => r.ms).join(', ')}) against a ${budgetMs}ms budget`)
                    .toBeLessThanOrEqual(budgetMs);
            }
        });
    }
});

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
        // Not `fcp >= entryJs - 50`, the premise of an empty `<app-app>`: measured under slow 4G,
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
