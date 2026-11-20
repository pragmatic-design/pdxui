/**
 * What the js-framework-benchmark app does when it starts, beside rendering itself (#1246).
 *
 * Core's modules used to set themselves up when they loaded, whatever the app used: `resize` and
 * `scroll` listeners for the viewport signals, `online` for the network status, a MutationObserver on
 * `<html dir>`, a `keydown` and a body-scroll effect for the overlay stack, the context protocol's
 * `context-request` listener, a `localStorage` read for the theme, `matchMedia` queries for the screen
 * signals. The benchmark app uses none of them, so none of it may happen. Each now starts on its first
 * use, and the theme restore and the splash come from the boot modules the `pdx()` plugin imports into
 * an app that has them.
 *
 * The build on disk (`scenarios-build.ts`), served from the path its `base` names, with the browser's
 * own setup functions recorded before any script of the page runs.
 */
import { test, expect } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';
import { scenarioDist } from './scenarios-build';

const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
/** The `base` of `scripts/bench-jfb/vite.config.js`: the path js-framework-benchmark serves the app from. */
const BASE = '/frameworks/keyed/pdx/dist/';

let server: Server;
let url: string;
test.beforeAll(async () => {
    const dir = scenarioDist('benchmark');
    server = createServer((req, res) => {
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const rel = path === '/' ? 'index.html' : path.startsWith(BASE) ? path.slice(BASE.length) : null;
        const file = rel === null ? null : join(dir, normalize(rel));
        if (!file || !file.startsWith(dir) || !existsSync(file)) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
// The browser keeps its connections alive, and `close` waits for them: closed first.
test.afterAll(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); });

test('the benchmark app installs no listener, observer or query, and reads no storage, at startup', async ({ page }) => {
    await page.addInitScript((base) => {
        // Every call is recorded, with whether the app's bundle made it: the browser and Playwright add
        // listeners of their own, which a stack through the bundle tells apart.
        const seen: { what: string; app: boolean }[] = [];
        (window as unknown as { __startup: typeof seen }).__startup = seen;
        const note = (what: string) => seen.push({ what, app: (new Error().stack ?? '').includes(`${base}assets/`) });
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, ...rest: unknown[]) {
            if (this === window || this === document) note(`${this === window ? 'window' : 'document'}:${type}`);
            return (add as (...a: unknown[]) => void).call(this, type, ...rest);
        } as typeof add;
        const getItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (this: Storage, key: string) { note(`storage:${key}`); return getItem.call(this, key); };
        const matchMedia = window.matchMedia;
        window.matchMedia = function (query: string) { note(`matchMedia:${query}`); return matchMedia.call(window, query); };
        const observe = MutationObserver.prototype.observe;
        MutationObserver.prototype.observe = function (this: MutationObserver, target: Node, options?: MutationObserverInit) {
            if (target === document.documentElement) note('observe:<html>');
            return observe.call(this, target, options);
        };
    }, BASE);
    await page.goto(url);
    // Mounted: its buttons are drawn. Then a task, and a frame, for whatever a module would defer.
    await page.waitForSelector('#run');
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
    type Seen = { what: string; app: boolean }[];
    const fromApp = (await page.evaluate(() => (window as unknown as { __startup: Seen }).__startup))
        .filter((s) => s.app).map((s) => s.what);
    // The control: the recording works. The app's own delegated listeners are on its element, so the
    // page is given one of its own to record (not from the bundle, so it is not the app's).
    await page.evaluate(() => window.addEventListener('pdx-control', () => {}));
    const all = await page.evaluate(() => (window as unknown as { __startup: Seen }).__startup);
    expect(all.map((s) => s.what), 'the recording saw nothing').toContain('window:pdx-control');
    expect(fromApp, 'what the app set up at startup that it does not use').toEqual([]);
});
