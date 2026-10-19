/**
 * A page mounted and destroyed 100 times gives its memory back (#243; `docs/language/beta/performance.md`
 * → «Bounded memory», the second criterion).
 *
 * Leaks are invisible to functional tests: the page renders the same every time. The `memory` scenario
 * (`scenarios/memory/`, built by `scenarios-build.ts`) has a page that holds what a destruction must
 * release — an `@fetch` subscribed to the resource cache, a `@for` of 200 row scopes, an `attach:` with
 * a cleanup on every row, a child component per row. `window.__cycle(n)` mounts it, waits for its rows,
 * and removes it, n times.
 *
 * Measured through CDP on the production build: after a warm-up, a forced GC and the used heap as the
 * baseline; 100 cycles; a forced GC and the heap again, within 5% of the baseline. Each reading is the
 * median of three, each after its own GC, so one late collection does not decide it.
 *
 * The control is a page that leaks on purpose — a listener added to `window` in its script and never
 * removed, holding a per-instance ballast — and the same measurement has to catch it. The other half of
 * the criterion, the resource cache holding no subscription of a destroyed instance, is case 8 of
 * `packages/core/tests/async-contract.test.ts` (#254).
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

/** Mounts before the baseline, enough for the page's hot functions to reach optimised code. */
const WARM_UP = 30;

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** The used JS heap after a forced collection, median of three. */
async function heapAfterGc(page: Page): Promise<number> {
    const cdp = await page.context().newCDPSession(page);
    const readings: number[] = [];
    for (let i = 0; i < 3; i++) {
        await cdp.send('HeapProfiler.collectGarbage');
        readings.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
    }
    await cdp.detach();
    return median(readings);
}

/** Baseline and final heap around `n` cycles of `tag`, after a warm-up of the same page. */
async function measure(page: Page, url: string, tag: string, n: number): Promise<{ before: number; after: number }> {
    await page.goto(url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    // The warm-up: the first mounts load and compile what every later one shares — including the code
    // V8 optimises once a function is hot, which is retained heap but no instance's. Measured on this
    // page: from cycle 5 to 105 the optimised code alone grew ~70 KB (~4.5% of the heap); from 40 to
    // 240, 18 KB. A warm-up of 5 mounts read that compilation as a leak.
    await page.evaluate(({ t, k }) => (window as unknown as { __cycle(n: number, t: string): Promise<void> }).__cycle(k, t), { t: tag, k: WARM_UP });
    const before = await heapAfterGc(page);
    await page.evaluate(({ t, k }) => (window as unknown as { __cycle(n: number, t: string): Promise<void> }).__cycle(k, t), { t: tag, k: n });
    const after = await heapAfterGc(page);
    console.log(`[scenario] memory ${tag} heap ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB `
        + `(${(((after - before) / before) * 100).toFixed(1)}%)`);
    return { before, after };
}

let site: { url: string; server: Server };
test.beforeAll(async () => { site = await serve(scenarioDist('memory')); });
test.afterAll(async () => { await new Promise((r) => site.server.close(r)); });

test.describe('a page mounted and destroyed 100 times', () => {
    test.setTimeout(120_000);

    test('returns the heap within 5% of the first iteration', async ({ page }) => {
        const { before, after } = await measure(page, site.url, 'app-memory-page', 100);
        const growth = (after - before) / before;
        expect(growth, `heap ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`).toBeLessThanOrEqual(0.05);
    });

    test('control — a page that leaks a window listener is caught by the same measurement', async ({ page }) => {
        const { before, after } = await measure(page, site.url, 'app-memory-leaky', 100);
        const growth = (after - before) / before;
        expect(growth, `heap ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`).toBeGreaterThan(0.05);
    });
});
