/**
 * The showcase generated (#160), held to the issue's criteria against the client build.
 *
 * 1. A generated route's file holds the page's content before any script runs.
 * 2. Its content paints earlier than the client build's (reported).
 * 3. After the app has taken it over, the page is the one the client renders, and it works.
 * 4. Taking it over shifts nothing (CLS < 0.02, R2), and it answers no later than the client build.
 *
 * `ssg-site.ts` generated `dist-ssg/` and serves it on SSG_URL; `baseURL` is the client build.
 */
import { readFileSync } from 'node:fs';
import { test, expect } from './fixture';
import { SSG_REPORT, SSG_URL } from './ssg-site';
import { sessionFile } from './session';
import { throttle, LCP_RUNS } from './lcp';

interface Report {
    pages: { path: string; file: string; skipped: { tag: string; reason: string }[] }[];
    skippedRoutes: { path: string; reason: string }[];
}
const report = (): Report => JSON.parse(readFileSync(SSG_REPORT, 'utf-8')) as Report;

test.describe('the generated showcase', () => {
    test('every route is written, each component in it rendered', async () => {
        const { pages, skippedRoutes } = report();
        console.log(`[ssg] ${pages.length} pages; not written: ${skippedRoutes.map((r) => `${r.path} (${r.reason})`).join('; ')}`);
        expect(pages.length).toBeGreaterThanOrEqual(29);
        expect(pages.flatMap((p) => p.skipped.map((s) => `${p.path}: <${s.tag}> ${s.reason}`))).toEqual([]);
        // The one route left out is the one no role may open: its guard is the build session's too.
        expect(skippedRoutes.map((r) => r.path)).toEqual(['/tickets/1/billing']);
    });

    test('1. a route\'s file holds its page before any script runs', async ({ request }) => {
        const html = await (await request.get(`${SSG_URL}/tickets`)).text();
        expect(html).toContain('<pdx-router-outlet data-pdx-ssg="/tickets"');
        expect(html).toMatch(/<app-tickets [^>]*data-pdx-ssr=/);
        expect(html).toContain('data-test="tickets"');
        expect(html, 'the splash would cover the content').not.toContain('id="pdx-splash"');
    });
});

test.describe('a route\'s loader at build time (#239)', () => {
    /** The data a page carries, as `pdx-ssg-data` holds it. */
    const carried = (html: string): { builtAt: number; results: { key: string; value: { id?: number; reference?: string } }[] } | null => {
        const m = /<script type="application\/json" id="pdx-ssg-data">(.*?)<\/script>/.exec(html);
        return m ? JSON.parse(m[1]) : null;
    };

    test('/tickets/1 is written with its record, not its loading branch, and carries it', async ({ request }) => {
        const html = await (await request.get(`${SSG_URL}/tickets/1`)).text();
        expect(html, 'the loading branch was written').not.toContain('data-test="ticket-pending"');
        const data = carried(html);
        expect(data, 'no pdx-ssg-data script in the page').not.toBeNull();
        expect(data!.results.map((r) => [r.key, r.value.reference])).toEqual([['/tickets/:id(number)|id=1|', 'T-1000']]);
    });

    test('the client shows that record at once, and asks for it again behind it once, its staleTime past', async ({ browser, locale }) => {
        // The ticket's loader has no staleTime, so the build is always older than it: the kept result is
        // shown stale while the loader runs once. A loader with a staleTime the build is younger than
        // asks nothing; that side is held by the router's `ssg-data-seed.test.ts`.
        // Kept, the navigation does not wait for the loader: the outlet takes the page over first, and
        // the request lands behind it. Not kept, the first navigation waits for the loader before it
        // shows anything — no loading branch either, so that is not what tells them apart: the order is.
        // The API answers 2 s late, and the page says whether it was taken over before the answer.
        const context = await browser.newContext({ baseURL: SSG_URL, storageState: sessionFor(SSG_URL), locale });
        const page = await context.newPage();
        const asked: string[] = [];
        await page.route('**/api/tickets/1', async (route) => {
            asked.push(route.request().url());
            await new Promise((done) => setTimeout(done, 2_000));
            await route.continue();
        });
        await page.addInitScript(() => {
            const w = window as unknown as { __takenOverBeforeAnswer?: boolean; __pending?: boolean };
            new MutationObserver(() => {
                if (document.querySelector('[data-test="ticket-pending"]')) w.__pending = true;
                const outlet = document.querySelector('pdx-router-outlet');
                if (w.__takenOverBeforeAnswer === undefined && outlet && !outlet.hasAttribute('data-pdx-ssg') && document.querySelector('[data-test="ticket"]')) {
                    w.__takenOverBeforeAnswer = !performance.getEntriesByType('resource').some((e) => /\/api\/tickets\/1$/.test(e.name));
                }
            }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-pdx-ssg'] });
        });
        await page.goto('/tickets/1');
        await expect(page.locator('[data-test="ticket"]')).toBeVisible();
        await page.waitForLoadState('networkidle');
        const seen = await page.evaluate(() => {
            const w = window as unknown as { __takenOverBeforeAnswer?: boolean; __pending?: boolean };
            return { before: w.__takenOverBeforeAnswer, pending: w.__pending === true };
        });
        expect(seen.before, 'the page was taken over only once the loader answered: the record it carries was not kept').toBe(true);
        expect(seen.pending, 'the page showed the loading branch').toBe(false);
        expect(asked, 'the loader ran more than once, or not at all behind the kept result').toHaveLength(1);
        await context.close();
    });
});

/** Routes the comparison opens, with the root their page renders. */
const ROUTES = [
    { route: '/', root: 'dashboard', tag: 'app-dashboard' },
    { route: '/tickets', root: 'tickets', tag: 'app-tickets' },
    { route: '/customers/1', root: 'customer', tag: 'app-customer' },
    { route: '/settings', root: 'settings', tag: 'app-settings' },
];

/** The session for each server: the client build's (5314) and the generated site's. */
const sessionFor = (base: string): string => sessionFile(Number(new URL(base).port));

/**
 * The app once it runs: the outlet's markup — the shell and the page — with what differs by
 * construction taken out. The server's marks (`data-pdx-ssr`, `data-pdx-ssg`) and the comments
 * hydration reads are the generated page's only; a generated id is counted from wherever the render
 * started, so its value differs where it is the same id; attributes are compared in name order.
 */
function normalisedApp(): string {
    const outlet = document.querySelector('pdx-router-outlet');
    if (!outlet) return 'no outlet';
    const copy = outlet.cloneNode(true) as Element;
    const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
    const comments: Node[] = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    for (const c of comments) c.parentNode?.removeChild(c);
    const REFERS = ['id', 'for', 'aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-activedescendant', 'aria-owns', 'list', 'popovertarget', 'anchor'];
    for (const el of [copy, ...copy.querySelectorAll('*')]) {
        el.removeAttribute('data-pdx-ssr');
        el.removeAttribute('data-pdx-ssg');
        for (const name of REFERS) if (el.hasAttribute(name)) el.setAttribute(name, '*');
        // In name order: the parser keeps the order the server wrote, the client the order it set
        // them in, and the order means nothing.
        const attrs = [...el.attributes].map((a) => [a.name, a.value] as const).sort(([a], [b]) => a.localeCompare(b));
        for (const [name] of attrs) el.removeAttribute(name);
        for (const [name, value] of attrs) el.setAttribute(name, value);
    }
    return copy.outerHTML.replace(/>\s+</g, '><');
}

test.describe('3. the page after the app takes it over', () => {
    for (const { route, root } of ROUTES) {
        test(`${route} is the page the client renders`, async ({ browser, baseURL, locale }) => {
            const open = async (base: string): Promise<{ html: string; errors: string[] }> => {
                const context = await browser.newContext({ baseURL: base, storageState: sessionFor(base), locale });
                const page = await context.newPage();
                const errors: string[] = [];
                page.on('pageerror', (e) => errors.push(e.message));
                page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
                await page.goto(route);
                await expect(page.locator(`[data-test="${root}"]`)).toBeVisible();
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(500);
                const html = await page.evaluate(normalisedApp);
                await context.close();
                return { html, errors };
            };
            const client = await open(baseURL!);
            const generated = await open(SSG_URL);
            expect(generated.errors, 'the generated page logged errors').toEqual([]);
            expect(generated.html).toBe(client.html);
        });
    }

    test('and it works: a control on the generated page answers', async ({ browser, locale }) => {
        const context = await browser.newContext({ baseURL: SSG_URL, storageState: sessionFor(SSG_URL), locale });
        const page = await context.newPage();
        await page.goto('/tickets');
        await expect(page.locator('[data-test="tickets"]')).toBeVisible();
        // The rail's handle, a button the server wrote: its listener and its bound state are the
        // hydrated ones.
        const handle = page.locator('[data-test="side-handle"]');
        await expect(handle).toHaveAttribute('aria-expanded', 'true');
        await handle.click();
        await expect(handle).toHaveAttribute('aria-expanded', 'false');
        // The bar's settings link: the router navigates inside the app, without loading a page.
        await page.evaluate(() => { (window as unknown as { __stayed: boolean }).__stayed = true; });
        await page.locator('[data-test="to-settings-bar"]').click();
        await expect(page.locator('[data-test="settings"]')).toBeVisible();
        expect(await page.evaluate(() => (window as unknown as { __stayed?: boolean }).__stayed), 'the click loaded a new document').toBe(true);
        await context.close();
    });
});

interface Load {
    /** The last largest-contentful-paint, before any input. */
    lcp: number;
    /** Layout shift over the load, excluding shifts after an input (there are none). */
    cls: number;
    /** When the page's component is defined and its element upgraded: it answers from there. */
    interactive: number;
}

/** A cold load of `route` on slow 4G, and what it measured. */
async function coldLoad(browser: import('@playwright/test').Browser, base: string, route: string, root: string, tag: string, locale: string | undefined): Promise<Load> {
    const context = await browser.newContext({ baseURL: base, storageState: sessionFor(base), locale });
    const page = await context.newPage();
    await page.addInitScript((pageTag) => {
        const w = window as unknown as { __lcp: number; __cls: number; __interactive?: number };
        w.__lcp = -1;
        w.__cls = 0;
        new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1];
            if (last) w.__lcp = last.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
                if (!e.hadRecentInput) w.__cls += e.value;
            }
        }).observe({ type: 'layout-shift', buffered: true });
        const check = (): void => {
            if (document.querySelector(`${pageTag}:defined`)) w.__interactive = performance.now();
            else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
    }, tag);
    await throttle(page);
    await page.goto(route, { waitUntil: 'load' });
    await expect(page.locator(`[data-test="${root}"]`)).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(() => (window as unknown as { __interactive?: number }).__interactive !== undefined, undefined, { timeout: 30_000 });
    await page.waitForTimeout(1_500);
    const load = await page.evaluate(() => {
        const w = window as unknown as { __lcp: number; __cls: number; __interactive: number };
        return { lcp: Math.round(w.__lcp), cls: w.__cls, interactive: Math.round(w.__interactive) };
    });
    await context.close();
    return load;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/**
 * The routes timed. `/tickets` is a page whose content the server writes: the generated page has to
 * paint it earlier and answer no later. `/`, the dashboard, paints its figures, which arrive from the
 * mock server after the scripts in both builds: its two medians are 10–25 ms apart on runs that spread
 * 80 ms (measured 2026-11-08), so an order between them would be the machine's. Reported, and held to
 * the layout shift only.
 */
const TIMED = [{ ...ROUTES[1], ordered: true }, { ...ROUTES[0], ordered: false }];

test.describe('2 and 4. a cold load, generated against client-rendered', () => {
    for (const { route, root, tag, ordered } of TIMED) {
        test(`${route}: ${ordered ? 'paints earlier, shifts nothing, answers no later' : 'shifts nothing (timings reported)'}`, async ({ browser, baseURL, locale }) => {
            test.setTimeout(180_000);
            const client: Load[] = [];
            const generated: Load[] = [];
            // Interleaved, so the machine's load at one moment falls on both.
            for (let i = 0; i < LCP_RUNS; i++) {
                client.push(await coldLoad(browser, baseURL!, route, root, tag, locale));
                generated.push(await coldLoad(browser, SSG_URL, route, root, tag, locale));
            }
            const sum = (loads: Load[]) => ({
                lcp: median(loads.map((l) => l.lcp)), cls: Math.max(...loads.map((l) => l.cls)), interactive: median(loads.map((l) => l.interactive)),
            });
            const c = sum(client);
            const g = sum(generated);
            console.log(`[ssg] slow 4G ${route}: LCP client ${c.lcp} ms, generated ${g.lcp} ms; interactive client ${c.interactive} ms, generated ${g.interactive} ms; CLS generated ${g.cls.toFixed(4)} (runs: client ${client.map((l) => `${l.lcp}/${l.interactive}`).join(' ')}, generated ${generated.map((l) => `${l.lcp}/${l.interactive}`).join(' ')})`);
            expect(g.cls, 'taking the page over shifted it').toBeLessThan(0.02);
            if (!ordered) return;
            expect(g.lcp, 'the generated page painted its content no earlier than the client build').toBeLessThan(c.lcp);
            expect(g.interactive, 'the generated page answered later than the client build').toBeLessThanOrEqual(c.interactive);
        });
    }
});
