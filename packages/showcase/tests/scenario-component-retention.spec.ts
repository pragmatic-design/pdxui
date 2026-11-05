/**
 * A removed component is collected: no instance of any @pdxui/ui component outlives its removal (#865).
 *
 * The `component-mount` scenario (`scenarios/component-mount/`, built by `scenarios-build.ts`) mounts
 * 100 of a tag at a time and removes them. Here every tag of the library's manifest gets its own page:
 * a warm-up, then ROUNDS mounts of 100, a forced garbage collection, and the count of objects whose
 * prototype chain holds the tag's own class (`Runtime.queryObjects`). That is the number of live
 * instances, attached or not, and the page holds none attached after a mount.
 *
 * A count, not a heap size: an instance is either collected or it is not, so a row does not depend on
 * how busy the machine is. Kilobytes are printed beside it, for whoever reads a row that retains.
 *
 * A tag in RETAINED is known to keep its instances, for the reason its issue gives. Its row passes
 * while it still does, and fails once it no longer does, so the list cannot outlive the fix.
 */
import { test, expect, type Page } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
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
    return new Promise((done) => server.listen(0, '127.0.0.1', () => {
        done({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, server });
    }));
}

/** Every tag the library declares, from its manifest: a component added there gets a row by arriving. */
const manifestPath = resolve(fileURLToPath(import.meta.url), '..', '..', '..', 'ui', 'custom-elements.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { modules: { declarations?: { tagName?: string }[] }[] };
const TAGS = manifest.modules.flatMap((m) => (m.declarations ?? []).flatMap((d) => (d.tagName ? [d.tagName] : []))).sort();

/** Mounts of 100 before the count: the first mounts' one-time allocations are not what is measured. */
const WARM_UP = 2;
const ROUNDS = 5;
const INSTANCES = 100;

/**
 * Tags known to keep their removed instances, and the issue that says why. Measured 2026-11-05: 25 of
 * 114 at first; 19 of them through `uiAttr`, which held each `read` function strongly, and no longer
 * do. These six keep theirs for a reason of their own (#881).
 */
const RETAINED: Record<string, string> = {
    'pdx-carousel': '#881',
    'pdx-col': '#881',
    'pdx-error-boundary': '#881',
    'pdx-form-field': '#881',
    'pdx-rich-text': '#881',
    'pdx-select': '#881',
};

/** Live instances of `tag` after a forced GC, and the used heap in KB. */
async function liveInstances(page: Page, tag: string): Promise<{ live: number; heapKb: number }> {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    await cdp.send('HeapProfiler.collectGarbage');
    const { result: proto } = await cdp.send('Runtime.evaluate', { expression: `customElements.get(${JSON.stringify(tag)}).prototype` });
    const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.objectId! });
    const { result } = await cdp.send('Runtime.callFunctionOn', {
        objectId: objects.objectId!,
        functionDeclaration: 'function () { return this.length; }',
        returnByValue: true,
    });
    const heapKb = Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / 1024);
    await cdp.detach();
    return { live: result.value as number, heapKb };
}

let site: { url: string; server: Server };
test.beforeAll(async () => { site = await serve(scenarioDist('component-mount')); });
test.afterAll(async () => { await new Promise((r) => site.server.close(r)); });

test('the scenario registers every tag of the manifest', async ({ page }) => {
    await page.goto(site.url);
    await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
    const missing = await page.evaluate((tags) => tags.filter((t) => !customElements.get(t)), TAGS);
    expect(TAGS.length, 'the manifest lists no tag').toBeGreaterThan(100);
    expect(missing, 'tags in custom-elements.json the library does not register').toEqual([]);
});

test('RETAINED names only tags of the manifest', () => {
    expect(Object.keys(RETAINED).filter((t) => !TAGS.includes(t))).toEqual([]);
});

test.describe('a removed component is collected', () => {
    for (const tag of TAGS) {
        const known = RETAINED[tag];
        test(known ? `${tag} still keeps its instances (${known})` : `${tag} keeps no instance`, async ({ browser }) => {
            const page = await browser.newPage();
            await page.goto(site.url);
            await page.waitForFunction(() => (window as unknown as { __ready?: boolean }).__ready === true);
            const mount = () => page.evaluate(({ t, n }) => (window as unknown as { __mount(t: string, n: number): Promise<number> }).__mount(t, n), { t: tag, n: INSTANCES });
            for (let i = 0; i < WARM_UP; i++) await mount();
            const before = await liveInstances(page, tag);
            for (let i = 0; i < ROUNDS; i++) await mount();
            const after = await liveInstances(page, tag);
            await page.close();

            const mounted = (WARM_UP + ROUNDS) * INSTANCES;
            const perInstanceKb = (after.heapKb - before.heapKb) / (ROUNDS * INSTANCES);
            console.log(`[scenario] ${tag}: ${after.live} of ${mounted} instances live after removal, ${perInstanceKb.toFixed(2)} KB per instance`);
            if (known) {
                expect(after.live, `${tag} no longer keeps its instances: take it out of RETAINED, and say so on ${known}`).toBeGreaterThan(0);
            } else {
                expect(after.live, `${tag}: ${after.live} of ${mounted} removed instances are still alive after a GC`).toBe(0);
            }
        });
    }
});
