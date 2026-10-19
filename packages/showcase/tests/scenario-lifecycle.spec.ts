/**
 * A frozen page costs no CPU (#269; `docs/language/beta/lifecycle.md` → «The matrix», column frozen,
 * and «Acceptance cases» 1 and 6).
 *
 * The `lifecycle` scenario (`scenarios/lifecycle/`, built by `scenarios-build.ts`) has a kept-alive
 * route page, `/kept`, holding what a freeze must stop: an effect, a `useQuery` polling every 100 ms,
 * a dynamic `@title`, an `@fetch` and a `useQuery` with `staleTime: 1000`, an `@await { maxMs: 1000 }`.
 * Navigating to `/` freezes it; navigating back resumes it. `/switch` has a `<component :is
 * @keepAlive>`. The mock transport counts requests by path, and `window.__lc` is the probe.
 *
 * Durations are what these cases are about — «for one second nothing runs», «the timeout fires 700 ms
 * after the resume» — so the spec waits them out; it waits for nothing else that way.
 */
import { test, expect, type Page } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';
import { scenarioDist } from './scenarios-build';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/** A static server over the scenario's build: module scripts do not load from file://. */
function serve(dir: string): Promise<{ url: string; server: Server }> {
    const server = createServer((req, res) => {
        const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]));
        const file = join(dir, path === '/' || path === '\\' ? 'index.html' : path);
        if (!file.startsWith(dir) || !existsSync(file)) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
        resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, server });
    }));
}

interface Probe {
    effectRuns: number;
    titleWrites: number;
    requests: Record<string, number>;
    hidden: Record<string, number>;
    shown: Record<string, number>;
    tick: { set(v: number): void };
}
type Win = Window & {
    __lc: Probe; __ready?: boolean;
    __go(path: string): void; __invalidate(tags: string[]): number; __newWait(): void; __lc_show(tag: string): void;
};

const probe = (page: Page) => page.evaluate(() => {
    const lc = (window as unknown as Win).__lc;
    return { effectRuns: lc.effectRuns, titleWrites: lc.titleWrites, requests: { ...lc.requests }, hidden: { ...lc.hidden }, shown: { ...lc.shown } };
});
const requests = async (page: Page, path: string) => (await probe(page)).requests[path] ?? 0;
const go = (page: Page, path: string) => page.evaluate((p) => (window as unknown as Win).__go(p), path);

let site: { url: string; server: Server };
test.beforeAll(async () => { site = await serve(scenarioDist('lifecycle')); });
test.afterAll(async () => { await new Promise((r) => site.server.close(r)); });

/** Open the app on `/`, then show the kept page with its data in. */
async function openKept(page: Page): Promise<void> {
    await page.goto(site.url);
    await page.waitForFunction(() => (window as unknown as Win).__ready === true);
    await expect(page.locator('[data-test="home"]')).toBeVisible();
    await go(page, '/kept');
    await expect(page.locator('[data-test="item"]')).toHaveText('/api/item #1');
    await expect(page.locator('[data-test="query"]')).toHaveText('/api/query #1');
}

/** Leave the kept page: the outlet freezes it into a fragment. */
async function freeze(page: Page): Promise<void> {
    await go(page, '/');
    await expect(page.locator('[data-test="home"]')).toBeVisible();
    await expect(page.locator('[data-test="tick"]'), 'the kept page is still in the document').toHaveCount(0);
}

/** Come back: the outlet resumes the frozen page. */
async function resume(page: Page): Promise<void> {
    await go(page, '/kept');
    await expect(page.locator('[data-test="tick"]')).toBeVisible();
}

test.describe('a frozen page', () => {
    test.setTimeout(60_000);

    test('case 1 — no effect run, no request, no title write for a second; a change runs the effect once on resume', async ({ page }) => {
        await openKept(page);
        // Polling is on while the page is shown.
        const shownPolls = await requests(page, '/api/poll');
        await expect.poll(() => requests(page, '/api/poll'), { message: 'the page never polled' }).toBeGreaterThan(shownPolls);

        await freeze(page);
        const frozen = await probe(page);
        await page.evaluate(() => { const lc = (window as unknown as Win).__lc; lc.tick.set(1); lc.tick.set(2); lc.tick.set(3); });
        await page.waitForTimeout(1000);
        const after = await probe(page);
        expect(after.effectRuns, 'an effect ran while the page was frozen').toBe(frozen.effectRuns);
        expect(after.requests['/api/poll'], 'the useQuery polled while the page was frozen').toBe(frozen.requests['/api/poll']);
        expect(after.titleWrites, 'the frozen page wrote the title').toBe(frozen.titleWrites);

        await resume(page);
        await expect(page.locator('[data-test="tick"]')).toHaveText('3');
        await expect(page).toHaveTitle('Kept 3');
        expect((await probe(page)).effectRuns - frozen.effectRuns, 'three changes while frozen: the effect runs once on resume').toBe(1);
    });

    test('case 6 — an @await frozen 300 ms into maxMs 1000 times out 700 ms after the resume', async ({ page }) => {
        await openKept(page);
        const elapsed = await page.evaluate(async () => {
            const w = window as unknown as Win;
            const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
            const until = async (selector: string) => { while (!document.querySelector(selector)) await new Promise((r) => requestAnimationFrame(r)); };
            w.__newWait();
            await until('[data-test="waiting"]');
            await sleep(300);
            w.__go('/');
            await until('[data-test="home"]');
            await sleep(5000);
            const resumedAt = performance.now();
            w.__go('/kept');
            await until('[data-test="timeout"]');
            return performance.now() - resumedAt;
        });
        expect(elapsed, `timed out ${Math.round(elapsed)} ms after the resume`).toBeGreaterThan(550);
        expect(elapsed, `timed out ${Math.round(elapsed)} ms after the resume`).toBeLessThan(950);
    });
});

test.describe('a frozen page\'s sources on resume', () => {
    test.setTimeout(60_000);

    test('frozen past staleTime: no request while frozen, exactly one at the resume', async ({ page }) => {
        await openKept(page);
        await freeze(page);
        await page.waitForTimeout(2000);
        expect(await requests(page, '/api/item'), '@fetch requested while frozen').toBe(1);
        expect(await requests(page, '/api/query'), 'useQuery requested while frozen').toBe(1);

        await resume(page);
        await expect.poll(() => requests(page, '/api/item'), { message: 'a stale @fetch was not refreshed on resume' }).toBe(2);
        await expect.poll(() => requests(page, '/api/query'), { message: 'a stale useQuery was not refreshed on resume' }).toBe(2);
        await page.waitForTimeout(300);
        expect(await requests(page, '/api/item'), '@fetch requested more than once on resume').toBe(2);
        expect(await requests(page, '/api/query'), 'useQuery requested more than once on resume').toBe(2);
    });

    test('frozen within staleTime: no request', async ({ page }) => {
        await openKept(page);
        await freeze(page);
        await page.waitForTimeout(200);
        await resume(page);
        await page.waitForTimeout(300);
        expect(await requests(page, '/api/item'), 'a fresh @fetch was refetched on resume').toBe(1);
        expect(await requests(page, '/api/query'), 'a fresh useQuery was refetched on resume').toBe(1);
    });

    test('invalidated while frozen: no request while frozen, one at the resume', async ({ page }) => {
        await openKept(page);
        await freeze(page);
        await page.evaluate(() => { const w = window as unknown as Win; w.__invalidate(['item']); w.__invalidate(['query']); });
        await page.waitForTimeout(300);
        expect(await requests(page, '/api/item'), 'an invalidation started an @fetch request while frozen').toBe(1);
        expect(await requests(page, '/api/query'), 'an invalidation started a useQuery request while frozen').toBe(1);

        await resume(page);
        await expect.poll(() => requests(page, '/api/item'), { message: 'an invalidated @fetch was not refreshed on resume' }).toBe(2);
        await expect.poll(() => requests(page, '/api/query'), { message: 'an invalidated useQuery was not refreshed on resume' }).toBe(2);
        await page.waitForTimeout(300);
        expect(await requests(page, '/api/item')).toBe(2);
        expect(await requests(page, '/api/query')).toBe(2);
    });
});

test('a kept <component :is> view switched away is frozen: onHide, then onShow when it comes back', async ({ page }) => {
    await page.goto(site.url);
    await page.waitForFunction(() => (window as unknown as Win).__ready === true);
    await go(page, '/switch');
    await expect(page.locator('[data-test="view-a"]')).toBeVisible();

    await page.evaluate(() => (window as unknown as Win).__lc_show('app-lc-view-b'));
    await expect(page.locator('[data-test="view-b"]')).toBeVisible();
    await expect(page.locator('[data-test="view-a"]'), 'the view switched away is still in the document').toHaveCount(0);
    expect((await probe(page)).hidden.a, 'the view switched away was not told it is hidden').toBe(1);

    await page.evaluate(() => (window as unknown as Win).__lc_show('app-lc-view-a'));
    await expect(page.locator('[data-test="view-a"]')).toBeVisible();
    expect((await probe(page)).shown.a, 'the view brought back was not told it is shown').toBe(1);
});
