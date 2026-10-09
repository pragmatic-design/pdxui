// The first screen costs two round-trips, not three.
//
// Without a preload a cold `/` fetches its JavaScript in THREE waves: the entry, then — once the
// browser has executed it and learnt what else is needed — the route's own chunk and the components
// it renders. The middle gap is 24 of 80 ms on localhost, where a round-trip is free; on a real
// network it is a full RTT, paid by every first-time visitor.
//
// Vite emits `rel="modulepreload"` for what it can see statically, and a route is a dynamic import
// the generated router resolves — so it cannot see it. The compiler can: the route table is built
// at compile time, which is the premise of the generated router. The plugin names the landing
// route's chunk, and the chunks that chunk imports statically, in the HTML.
//
// Two measurements, and they fail for different reasons: the HTML one says the links are there, the
// wave one says they did something. A preload that names the wrong file passes the first and not
// the second.
import { test, expect, type Page } from './fixture';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const html = () => readFileSync(resolve(DIST, 'index.html'), 'utf-8');

/** The `href`s of every modulepreload in the built page, in order. */
const preloads = (): string[] =>
    [...html().matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map((m) => m[1]);

/**
 * When each JavaScript request went out and when it finished, on ONE clock.
 *
 * A WAVE is readable from that: a request that starts after everything before it has finished is
 * the first of a new one.
 *
 * ⚠️ The clock is the BROWSER's: Resource Timing, read from the page once it is idle. The other
 * clocks fail the control below:
 *   - `req.timing()` as it is: its fields are relative to each request's OWN start, so every
 *     request seems to begin near zero, every page counts one wave, and no row here can fail;
 *   - `startTime` added back: for a response the test serves itself, the fields leave out the
 *     time it waited, and a chain of 3 reads 2;
 *   - this process's clock on Playwright's events: they arrive late and out of order for a
 *     served response, and a chain of 3 reads 1.
 * The browser's own entries are one clock for every request, and they see the wait as network.
 *
 * Every script also gets a round trip: `LATENCY_MS` before it is answered. On localhost a response
 * takes about a millisecond, so whether a module and the one it imports read as one wave or two
 * comes down to 0.2 ms either way — measured flipping between runs. With a round trip, requests the
 * browser issued together overlap by construction, and one it could only issue after another has
 * finished starts a full round trip later. That is the network the count is ABOUT.
 */
const LATENCY_MS = 30;

/**
 * `page`'s tag: the first screen is the JavaScript that was asked for before the landing page began
 * to mount. What a page asks for once it is mounting is not the first screen's cost, and the
 * dashboard does exactly that on purpose: its numbers come from the simulated server in its
 * `onMount`, and its charts when scrolled into view. Those are listed in `after`.
 *
 * ⚠️ Taken SYNCHRONOUSLY, in the page element's `connectedCallback`. Not a MutationObserver on
 * `[data-test="kpi-open"]`: that fires at the next microtask checkpoint, after the task that
 * mounted the page, `onMount` included. Measured that way, the dashboard's data chunks start at
 * 87 ms and the observer sees the page at 101 — always before the mark — so they count as the first
 * screen's, and at CPU 4× they read as a third wave. With the mark at the connect: 82 → 84, and at
 * 4× 218 → 229, after it every time.
 */
async function jsWaves(page: Page, url: string, pageTag?: string, cpu = 1): Promise<{ waves: number; files: string[]; after: string[] }> {
    if (cpu !== 1) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
    }
    await page.route(/\.js(\?|$)/, async (route) => {
        await new Promise((r) => setTimeout(r, LATENCY_MS));
        await route.fallback();
    });
    if (pageTag) {
        await page.addInitScript((tag) => {
            const w = window as unknown as { __mountedAt?: number };
            const define = customElements.define.bind(customElements);
            customElements.define = (name, ctor, options) => {
                if (name === tag) {
                    const connected = ctor.prototype.connectedCallback as ((...a: unknown[]) => void) | undefined;
                    ctor.prototype.connectedCallback = function (this: HTMLElement, ...args: unknown[]) {
                        if (w.__mountedAt === undefined) w.__mountedAt = performance.now();
                        return connected?.apply(this, args);
                    };
                }
                return define(name, ctor, options);
            };
        }, pageTag);
    }
    await page.goto(url, { waitUntil: 'networkidle' });
    const paintedAt = pageTag
        ? await page.evaluate(() => (window as unknown as { __mountedAt?: number }).__mountedAt ?? Infinity)
        : Infinity;
    if (pageTag) expect(paintedAt, `<${pageTag}> never connected: the first screen was not measured`).not.toBe(Infinity);
    // `responseEnd`: the body is in, which is when an importer can go on to the next module.
    const all = await page.evaluate(() =>
        (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
            .filter((e) => /\.js(\?|$)/.test(e.name))
            .map((e) => ({ start: e.startTime, end: e.responseEnd, file: e.name.split('/').pop()! })));
    const spans = all.filter((s) => s.start <= paintedAt);
    const after = all.filter((s) => s.start > paintedAt).map((s) => s.file);
    spans.sort((a, b) => a.start - b.start);

    let waves = 0;
    let frontier = -Infinity;
    for (const s of spans) {
        // No grace. Two requests issued together both start before the first of them FINISHES, so
        // they share a wave anyway. A 2 ms grace here would merge a module with the one that imports
        // it: it starts about 1 ms after its parent ends, and that IS a round trip.
        if (s.start > frontier) waves++;
        frontier = Math.max(frontier, s.end);
    }
    return { waves, files: spans.map((s) => s.file), after };
}

test('control — the counter reads three waves where three are built', async ({ page }) => {
    // Without this row, a counter that always says 1 — one that reads per-request clocks — passes
    // every row below. A page whose modules can only be
    // found one after another: a.js imports b.js, which imports c.js.
    const body: Record<string, string> = {
        '/__waves/a.js': "import './b.js';",
        '/__waves/b.js': "import './c.js';",
        '/__waves/c.js': 'window.__wavesDone = true;',
    };
    await page.route('**/__waves/**', (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('.html')) {
            return route.fulfill({ contentType: 'text/html', body: '<script type="module" src="/__waves/a.js"></script>' });
        }
        return route.fulfill({ contentType: 'text/javascript', body: body[path] ?? '' });
    });
    const { waves, files } = await jsWaves(page, '/__waves/page.html');
    expect(files, 'the three modules were not all fetched').toHaveLength(3);
    expect(waves, `a chain of three imports read as ${waves} wave(s)`).toBe(3);
});

test('the built page names the landing route chunk before the browser asks for it', () => {
    const links = preloads();
    expect(links.length, 'dist/index.html has no modulepreload: the first screen is found one '
        + 'round-trip after the entry arrives').toBeGreaterThan(0);

    const dashboard = links.filter((href) => /\/assets\/dashboard-[^/]+\.js$/.test(href));
    expect(dashboard, 'the landing route\'s own chunk is not preloaded — whatever else is')
        .toHaveLength(1);
});

/**
 * The modules a preloaded file carries, read from its sourcemap (the build writes them hidden).
 *
 * By MODULE and not by file name: Rollup names a shared chunk after one of the modules in it, so
 * a module can move into a chunk called after another — `pdx-icon` in a `pdx-dropdown-menu-*` chunk,
 * still preloaded — and a check on `/pdx-icon-` would read it as missing.
 */
const preloadedModules = (): string[] => preloads().flatMap((href) => {
    const map = JSON.parse(readFileSync(resolve(DIST, '.' + href + '.map'), 'utf-8')) as { sources: string[] };
    return map.sources.map((s) => s.replace(/\\/g, '/'));
});

test('and the components that chunk imports, which is the same wave', () => {
    const modules = preloadedModules();
    // The route's chunk imports these statically, so the browser would ask for them in the wave
    // after the route's own. Named here, they come with it. `pdx-list`, the dashboard's queue.
    for (const name of ['list/pdx-list.ts']) {
        expect(modules.some((source) => source.endsWith(`ui/src/${name}`)),
            `${name} is a static import of the landing chunk and is not preloaded`).toBe(true);
    }
    // `pdx-icon` is the opposite claim: the dashboard's `pdx-list` draws one icon, its empty
    // state's, and imported statically the whole set would be 16.3 KB of a first paint whose list
    // has rows. It is loaded when an icon is drawn, so it is NOT preloaded.
    expect(modules.some((source) => source.endsWith('ui/src/icon/pdx-icon.ts')),
        'the icon set is preloaded again: something on the landing route imports pdx-icon statically').toBe(false);
    // The control: the lookup can say no. `pdx-select` is rendered by other routes, not this one.
    expect(modules.some((source) => source.endsWith('ui/src/select/pdx-select.ts')),
        'the preloaded modules include one no landing chunk imports: the lookup reads everything').toBe(false);
});

test('control — it does not preload the routes the visitor has not asked for', () => {
    // The barrel defect, one layer up: preloading every route makes the first screen pay for the
    // whole app, which is what code splitting was for.
    const links = preloads();
    for (const route of ['tickets', 'board', 'intake', 'account', 'login']) {
        expect(links.some((href) => new RegExp(`/assets/${route}-[^/]+\\.js$`).test(href)),
            `${route} is not the landing route and is preloaded anyway`).toBe(false);
    }
});

test('a cold first screen fetches its JavaScript in two waves, not three', async ({ page }) => {
    // The first screen is what the dashboard needed to begin mounting; its numbers are asked for
    // after. At CPU 4×: the condition a loaded gate is, and the one where a late mark reads 3 every
    // time.
    const { waves, files, after } = await jsWaves(page, '/', 'pdx-dashboard', 4);
    expect(files.length, 'no JavaScript was fetched — this test is measuring nothing')
        .toBeGreaterThan(3);
    expect(files.some((f) => /^dashboard-/.test(f)), 'the landing chunk is not among what the first screen fetched')
        .toBe(true);
    expect(waves, `the first screen still costs ${waves} round-trips: ${files.join(', ')} (after the paint: ${after.join(', ')})`)
        .toBeLessThanOrEqual(2);
});

test('the landing route\'s stylesheets start with the entry, not after it', async ({ page }) => {
    // Vite's dynamic-import helper waits for a chunk's CSS before the import resolves, so the first
    // page cannot mount until its stylesheets are in. Found only once the entry has run, they start a
    // round trip after it — and on slow 4G the first page was ready only when they arrived
    // (`first-paint.spec.ts`). Announced in the HTML, they start beside the entry.
    await page.route(/\.(js|css)(\?|$)/, async (route) => {
        await new Promise((r) => setTimeout(r, LATENCY_MS));
        await route.fallback();
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    const timing = await page.evaluate(() =>
        (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
            .map((e) => ({ file: e.name.split('/').pop()!, start: e.startTime, end: e.responseEnd })));
    const entry = timing.find((t) => /^index-[^.]+\.js$/.test(t.file));
    expect(entry, 'the entry module was not fetched: nothing is being measured').toBeDefined();
    const routeCss = timing.filter((t) => /^(dashboard|shell)-[^.]+\.css$/.test(t.file));
    expect(routeCss.length, 'the landing route\'s stylesheets were not fetched: nothing is being measured')
        .toBeGreaterThan(0);
    const late = routeCss.filter((t) => t.start >= entry!.end).map((t) => t.file);
    expect(late, 'these stylesheets of the first page started only after the entry arrived').toEqual([]);
    // Each fetched once: a preload in another CORS mode than Vite's own `<link>` is downloaded twice.
    for (const css of routeCss) {
        expect(timing.filter((t) => t.file === css.file), `${css.file} was fetched more than once`).toHaveLength(1);
    }
});

test('a cold load of a route that is not the landing one fetches in two waves, not three', async ({ page }) => {
    // The first thing a link someone was sent lands on. The shell holds the outlet for the route's
    // strings, and the outlet is what imports the route: the strings, THEN the chunk, would be a
    // wave of its own — 3 on this counter. The chunk starts alongside the strings.
    const { waves, files } = await jsWaves(page, '/tickets');
    expect(files.some((f) => /^tickets-/.test(f)), 'the tickets chunk was not fetched — nothing is being measured')
        .toBe(true);
    expect(waves, `a cold /tickets costs ${waves} round-trips: ${files.join(', ')}`).toBeLessThanOrEqual(2);
});

test('control — a route the visitor navigates to still fetches in one wave', async ({ page }) => {
    // A navigation needs no preload: `<pdx-link>` prefetches
    // the chunk on hover, and the outlet imports it on the click. If this ever needed a preload
    // too, the preload above would be hiding a regression rather than fixing anything.
    await page.goto('/');
    const { waves, files } = await jsWaves(page, '/tickets');
    expect(files.length, 'the navigation fetched no JavaScript at all — nothing is being measured')
        .toBeGreaterThan(0);
    expect(waves, `${waves} round-trips for a navigation: ${files.join(', ')}`).toBeLessThanOrEqual(2);
});
