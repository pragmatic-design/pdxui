/**
 * What the app weighs, as a ratchet.
 *
 * For a UI framework size is the number users judge on, and unmeasured, every commit could add to
 * it and none of them would be the one that did.
 *
 * Gzipped, because that is what a server sends and a browser downloads. Measured on `dist/` from a
 * real `vite build` of this app: the shell, three pages, one nested pair, the design system and
 * whatever @pdxui/ui the templates pulled in.
 *
 * The ratchet is the shape `tools/docs/surface-scan.mjs` uses for documentation coverage and
 * `i18n-no-literal-strings.test.ts` for hard-coded strings:
 *
 *   - the ceiling may only go DOWN. Raising it is allowed and must be argued for in the commit that
 *     raises it, because a bundle that grew is a decision, not an accident;
 *   - a ceiling left far above the measurement stops being a ratchet and becomes decoration, so
 *     there is a SLACK cap: too much headroom fails too, and the fix is to lower the ceiling.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets');

/**
 * What each ceiling covers, and why it is where it is.
 *
 * `entry` — the module `index.html` loads, and the one number a visitor always waits for before
 * anything renders. What belongs in it is what must exist before the first route is matched:
 *
 *   - the session. The guard redirect and the user → permissions effect must be in place before
 *     the first route is matched, or a deep-linked guarded route is decided before anything knows
 *     who the visitor is. The HTTP client is NOT: it lives in `src/api.ts`, imported by the pages
 *     that make requests, because in `src/auth.ts` it would put its middleware chain, timeout
 *     and retry in the entry — measured at 1.7 KB more;
 *   - the English strings of the shell and the landing route. English is the default, so the first
 *     screen never waits for a dictionary; every other screen's
 *     section, and the whole of Italian, is an `import()` asked for by the route that reads it
 *     (`src/locales/sections.ts`);
 *   - the route table and Vite's preload map, which is why every route costs the entry about a
 *     tenth of a kilobyte, and every new kind of record in the menu a little more (its entry, its
 *     section, its loader).
 *
 * No `@pdxui/ui` component is in the entry: the shell is the app's default LAYOUT, a chunk of its
 * own, and `entry-attribution.spec.ts` reads the entry's sourcemap and names the modules, because
 * this file can only say that a number moved.
 *
 * `js` — the sum of every chunk. A route is a chunk, and a visitor who never opens it downloads
 * none of it, so this is the honest number to report and the wrong one to optimise. Splitting moves
 * bytes out of the first request without removing them, and the same code gzips a little worse
 * split than inside one chunk — so the total rises when a module gains a second reader and Rollup
 * gives it a chunk of its own, and when a dictionary is split per route or per locale. When the
 * total and the first download disagree, the first download wins.
 *
 * `css` — the design system's foundation (tokens, layout, surfaces, typography, the CSS-only
 * tier), the one theme the app renders, and the stylesheets of the components it renders. A
 * component imports its own stylesheet, so its rules travel with it, and a route's styles are
 * extracted into a `.css` beside its chunk rather than a string its JS has to parse.
 *
 * `blocking` — what `index.html` asks for before the app can paint: the entry module, the entry
 * stylesheet, the landing route's chunk and its static imports named in
 * `<link rel="modulepreload">` (a route is a dynamic import Vite cannot see, and without the
 * preload the browser discovers it one round trip after the entry), and the stylesheets those
 * chunks import, named in `<link rel="preload" as="style">` (Vite's loader waits for them before
 * the page mounts). The ratchet is on the SUM and
 * not on the stylesheet: both resources are on the same wire, and moving a kilobyte from one to the
 * other buys nothing. `first-paint.spec.ts` holds the ordering that makes this true, and
 * `first-paint-waves.spec.ts` the wave count, so a preload that names the wrong file cannot pass by
 * making this number bigger.
 *
 * The shell is preloaded for the landing route, so what it imports is on the first paint. That is
 * why some things are deliberately NOT in it:
 *
 *   - `<pdx-breadcrumb>` (+22.9 KB, most of it the library's string registry) lives on the pages
 *     that show one;
 *   - the toast host is on the screens that can raise a toast, not in the shell (+3 KB for an answer
 *     to an action that has not happened yet); the queue is global, so they share one;
 *   - `<pdx-overlay-outlet>` is imported the first time the dialog queue holds a dialog (+2.4 KB for
 *     a dialog most visits never open).
 *
 * And some things deliberately ARE: the catalogue and the Demo panel are the shell's, because
 * behind a `@defer` each would put a round trip on the first click that opens it, the one moment
 * the visitor is waiting for it.
 *
 * Every ceiling is a ratchet, not a capacity: it may be raised only in the change that needs it,
 * with the reason beside it, and `SLACK_KB` keeps it close to the measurement. In absolute terms the
 * first paint is ~6% of the 2026 critical-path budget for a 3 s load at the 75th percentile
 * (1.2 MiB, JS-heavy, Alex Russell's «Performance Inequality Gap, 2026»).
 */
/**
 * The inline render path, measured.
 *
 * It swaps `html``` for imperative DOM construction, and since #107 it is the one render path of a
 * .pdx, so it is how this app is built and what these ceilings measure (`render-path.spec.ts` reads
 * it off the chunk). The figures below are HISTORICAL, measured before #107 while a build could
 * still select the template path — both paths, same machine, same commit:
 *
 *                     entry      JS total     CSS        blocking
 *   template          34.4 KB    360.6 KB     58.1 KB    88.3 KB
 *   inline            34.0 KB    378.4 KB     58.1 KB    87.9 KB
 *
 * So the first download is slightly SMALLER and the total is 5% bigger: imperative DOM code is more
 * instructions than a template string, and the pages carry the difference. It is not the
 * interesting number.
 *
 * The interesting number is the render, which this app cannot show: its first paint is dominated by
 * fetching and parsing the bundle. Measured instead on a 1500-row list, mounted thirty times per
 * page load in Chromium, median of 180 mounts:
 *
 *   template   19 ms      inline   5.5 ms      — 3.5×
 *
 * Time to first paint on THIS app, 47–53 cold loads interleaved between the two builds: 40 ms
 * median either way, inside one of Chromium's paint-timing ticks. Stated so the 3.5× is read with
 * its condition: it is the cost of RENDERING, and it only shows where rendering is the cost.
 *
 * The flag used to be off in this app's build, because a `<slot>` inside a component's tag was
 * dropped on the inline path. That was fixed (`compiler/tests/inline-slots.test.ts`) and the
 * override outlived it; turning it back on found three inline-path bugs no suite here ran, now
 * fixed in the compiler: a typed `const` read as a signal, `@defer` loading nothing, and a binding
 * writing its value again over a field being typed.
 */
/**
 * Diagnostics do not ship. They sit behind `DEV`, a const (`core/src/utils/env.ts`) and not a
 * function: a call the minifier will not inline is a branch it cannot fold, and the message would
 * ship to every visitor whether or not it could be printed. The bundler replaces the expression
 * behind `DEV`, and the branch goes with its string. `diagnostics.spec.ts` asserts WHICH strings left and which stayed, because
 * a number falling says nothing about what fell.
 */
// css 58 → 59: a grid cell's badges keep one line and mark the cut with an ellipsis (they wrapped,
// and made the row a line taller wherever the font was wider) — 58.1 KB measured.
// blocking 83 → 88: no byte more on the wire. The landing route's stylesheets (dashboard, shell,
// dropdown menu, progress: ~5 KB) were always needed before the first page mounts, but they were
// requested a wave after the entry and this sum, read off index.html, did not see them. index.html
// now announces them, which took the first page from ~1180 to ~885 ms on slow 4G
// (first-paint.spec.ts, #31) — and the sum counts them. 87.7 KB measured.
// entry 34 → 35: `@prefetch 'viewport'` is a policy the router now has (#42) — one shared
// IntersectionObserver in `<pdx-link>`, which every page's links need. 34.1 KB measured.
// blocking 88 → 89: html``'s self-closing expansion and the router's route-pattern compiler are
// scans now, not one-line regexes that ran in polynomial time and, in the router, escaped only the
// slashes of a path (#67). A few hundred bytes of code before the first paint. 88.1 KB measured.
// js 362 → 379: the app is built the production default way now, through the inline render path
// (#44). Same commit, 360.6 KB on the template path and 378.4 KB on the inline one: imperative DOM
// code is longer than a template string, page by page. The entry and the blocking bytes went DOWN
// (34.4 → 34.0, 88.3 → 87.9). 378.4 KB measured.
// js 379 → 380: every compiled template handler runs inside batch() (#114) — `batchHandler(…)` around
// each, so an effect reading a handler's writes runs once, on the finished state. 379.1 KB measured.
// entry 35 → 36, blocking 89 → 90: one router instead of two (#108). A build used to swap the
// router for one generated as a string; now it ships the TypeScript router and a route table. That
// router builds its matcher once at start-up — static paths in a map, dynamic ones as segment lists
// — and keeps a regex only for a pattern that is not made of whole segments, so both matchers are in
// the entry, with createRouterFromTable beside createRouter. About half a kilobyte: 34.9 → 35.4
// entry, 88.7 → 89.2 blocking (main measured in CI, this branch locally, both on LF sources).
// js 380 → 381: a form field knows it is required (#249: `required()` is branded, `FormField.required`
// reads the validators) and a submit stops when a value moved under its async validation (#253: every
// field's value recorded at the start, compared after). Core's form code, in the chunks of the pages
// that have a form; the entry and the first paint did not move. 380.1 KB measured in CI.
// js 381 → 459: every icon of the set is its own chunk now (#47), 359 of them, about 84 KB gzipped in
// all — and no visitor downloads them all: a page loads the icons it draws, one ~240-byte chunk each.
// What every page with an icon paid went DOWN: the `pdx-icon` chunk carried the whole set, 16.3 KB,
// and carries pdx-icon and the map of where each icon is, 6.9 KB. This sum counts every chunk once,
// which is why it is the number to report and the wrong one to optimise. 458.0 KB measured.
// blocking 90 → 91: the dashboard's `pdx-list` brings its empty state's icon, `inbox`, which shows
// while the queue loads (#47). Loaded on demand it was a request after the first paint; it is a few
// hundred bytes of the preloaded list chunk now. 90.4 KB measured.
// entry 36 → 37: the router outlet is in the entry, and a kept-alive page is bounded and frozen
// whole now — its child components frozen with it, by an ancestor walk in core's element (#268),
// and the least recently used frozen page destroyed past `keep-alive-max` (#270). A few hundred
// bytes; the showcase keeps no page alive, so it pays them and uses none. 36.1 KB measured.
// js 459 → 467, blocking 91 → 92: each block's static markup is built once and copied per render
// (#109), which took the script time of creating 1k rows from 13.7 to 11.1 ms and of 10k from 147 to
// 117 (js-framework-benchmark, before and after in one run, median of three). The builders cost what the render's
// static DOM calls cost before; what is new is the walk to the bound nodes, one statement per node
// on a path, and a marker where each dynamic block goes. Same machine, same day: main 458.6 → 466.3
// KB in all, 90.6 → 91.2 before the first paint; 2.5 KB of the first try went back by moving each
// block's template-and-import boilerplate into core's `staticBlock`.
// js 467 → 468: a component's visual states are custom states (#132) — `ctx.state`, the internals a
// host attaches for its declared states, and the Demo panel's `@state expanded`, the showcase's first.
// A few hundred bytes on top of the typed descriptor (#123), which had left the total on the ceiling:
// 467.0 KB measured locally, 467.1 in CI.
// entry 37 → 38, blocking 92 → 93: every host that exposes something listens for invoker commands
// (#140) — `exposeOnElement`, in the entry since every component may expose — on top of `@host`
// (#133) and `@part` (#134) in the compiled pages. Measured locally: entry 37.0, blocking 92.1, js
// 467.4; CI has measured 0.1 KB above local before, and the entry sat on its ceiling.
// js 468 → 469: a `@for` that receives many rows renders them in slices (#242) — the list's slicer
// and `processInSlices` (#240), which every keyed list now reaches. Measured locally: js 468.4.
// js 469 → 470: the set has heading-1, heading-2 and heading-3, the rich-text toolbar's numbered
// headings that drew nothing (#332). Three chunks of their own, each loaded only by a page that draws
// it; the entry and the first paint did not move. Measured locally: js 469.2.
// blocking 93 → 94: a scoped slot's body is built by the inline path (#364), as the rest of a .pdx
// is since #107 — no html`` parsed at runtime, and `${…}` and comments read as everywhere else. The
// shell's two slot fills (the rail's item and actions) are in its preloaded chunk, and imperative DOM
// code is longer than the template string it replaces, as #107 measured. Measured locally: blocking
// 93.3, js 469.8.
// js 470 → 456, blocking 94 → 93: a block's static markup is an HTML string the parser reads once,
// not a builder of DOM calls (#369), where the parser keeps the tree exactly — 120 of the
// showcase's 123 blocks. Measured locally: js 455.0, blocking 92.3, entry 37.7.
// js 456 → 457: pdx-data-grid loads its editors and edit dialog on first use, and pdx-pagination its
// page-size select (#447). A list that never edits stops fetching them before its first screen; the
// cost is in the total, where each now has a chunk of its own behind a dynamic import, with the
// loaders beside them. Same machine, same day: main 455.4 → 456.6 KB in all, entry 37.7 → 37.8,
// blocking 92.4 → 92.5. The showcase's own pages still import the editors for their forms, which is
// what #407 takes on next.
// js 457 → 463, css 59 → 60: /tickets defers what an action opens (#449), and its LCP on slow 4G went
// from ~3.9 s to ~3.0 s. No byte is added: on main, the modules the page imported for its forms
// shared one chunk named after pdx-auto-form (15.1 KB); with the page no longer importing them, Rollup
// splits them into eight (pdx-form-template, color-picker, inline-edit, rating, textarea, the create
// modal…), and each gzipped alone loses the dictionary they shared. Same machine, same day, chunk by
// chunk: js 456.4 → 462.4 KB over 454 → 462 files, css 58.4 → 59.1 over 52 → 56. Merging small chunks
// back is #407's next step, in pdx() for every app.
// entry 38 → 39, js 463 → 464, blocking 93 → 94: a navigation starts every level's chunk beside its
// loader, and a hover prefetches a route's data as well as its code (#119) — the router's navigation,
// in the entry. Same machine, same day: main entry 37.9 → 38.4, js 462.4 → 463.1, blocking
// 92.6 → 93.1. The showcase declares no @loader, so it pays for the router code and gains nothing yet.
const BUDGET_KB = { entry: 39, js: 464, css: 60, blocking: 94 };
/** How much headroom a ceiling may keep before it stops measuring anything. */
const SLACK_KB = 4;

/**
 * What `index.html` asks for before the app can paint, gzipped.
 *
 * Read off the HTML rather than guessed: a resource added to the head by a build change is a
 * resource this notices, which a hard-coded pair of filenames would not.
 */
function blockingKb(): number {
    const html = readFileSync(resolve(DIST, '..', 'index.html'), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length, 'index.html references nothing in assets/ — this budget measures nothing')
        .toBeGreaterThan(1);
    const bytes = refs.reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, f))).length, 0);
    return Math.round((bytes / 1024) * 10) / 10;
}

function gzippedKb(ext: '.js' | '.css'): number {
    const files = readdirSync(DIST).filter((f) => f.endsWith(ext));
    const total = files.reduce((sum, f) => sum + gzipSync(readFileSync(join(DIST, f))).length, 0);
    return Math.round((total / 1024) * 10) / 10;
}

test('there is a build on disk to weigh', () => {
    const files = readdirSync(DIST);
    expect(files.some((f) => f.endsWith('.js')), 'no JS in dist/assets').toBe(true);
    expect(files.some((f) => f.endsWith('.css')), 'no CSS in dist/assets').toBe(true);
    // An empty entry gzips to 20 bytes and would pass every budget below. Only the entry and the
    // stylesheet are checked: a route chunk is legitimately tiny — a page whose template is four
    // elements compiles to a few hundred bytes, and demanding a floor of it would be demanding
    // that the split not work.
    expect(statSync(join(DIST, entryChunk())).size, 'the entry is empty').toBeGreaterThan(10_000);
    const css = files.filter(f => f.endsWith('.css'));
    expect(css.reduce((n, f) => n + statSync(join(DIST, f)).size, 0), 'the stylesheets are empty')
        .toBeGreaterThan(10_000);
});

for (const ext of ['.js', '.css'] as const) {
    const key = ext.slice(1) as 'js' | 'css';

    test(`the ${key} bundle is within its budget`, () => {
        const kb = gzippedKb(ext);
        expect(kb, `${key} is ${kb} KB gzipped, the budget is ${BUDGET_KB[key]} KB — say in the commit why it grew`)
            .toBeLessThanOrEqual(BUDGET_KB[key]);
    });

    test(`the ${key} budget is held against the real number, not a stale one`, () => {
        const kb = gzippedKb(ext);
        expect(BUDGET_KB[key] - kb,
            `the ${key} budget is ${BUDGET_KB[key]} KB and the app is ${kb} KB — lower the budget`)
            .toBeLessThanOrEqual(SLACK_KB);
    });
}

test('the bytes before the first paint are within their budget', () => {
    const kb = blockingKb();
    expect(kb, `${kb} KB gzipped must arrive before anything is painted, the budget is `
        + `${BUDGET_KB.blocking} KB — say in the commit why it grew`)
        .toBeLessThanOrEqual(BUDGET_KB.blocking);
});

test('the blocking budget is held against the real number, not a stale one', () => {
    const kb = blockingKb();
    expect(BUDGET_KB.blocking - kb,
        `the blocking budget is ${BUDGET_KB.blocking} KB and the app is ${kb} KB — lower the budget`)
        .toBeLessThanOrEqual(SLACK_KB);
});

test('the numbers are reported, whether or not they pass', () => {
    // A budget nobody can read is a budget nobody lowers.
    const js = gzippedKb('.js');
    const css = gzippedKb('.css');
    const entry = Math.round((gzipSync(readFileSync(join(DIST, entryChunk()))).length / 1024) * 10) / 10;
    console.log(`[bundle] entry ${entry} KB (budget ${BUDGET_KB.entry}) · js ${js} KB total (budget ${BUDGET_KB.js})`
        + ` · css ${css} KB (budget ${BUDGET_KB.css}) · blocking ${blockingKb()} KB (budget ${BUDGET_KB.blocking})`);
    expect(js).toBeGreaterThan(0);
    expect(css).toBeGreaterThan(0);
});

test('the ENTRY is within its budget, which is the number a visitor waits for', () => {
    const kb = Math.round((gzipSync(readFileSync(join(DIST, entryChunk()))).length / 1024) * 10) / 10;
    expect(kb, `the entry is ${kb} KB gzipped, the budget is ${BUDGET_KB.entry} KB`)
        .toBeLessThanOrEqual(BUDGET_KB.entry);
    expect(BUDGET_KB.entry - kb, `the entry budget is ${BUDGET_KB.entry} KB and the entry is ${kb} KB — lower it`)
        .toBeLessThanOrEqual(SLACK_KB);
});

// ─── Route splitting ────────────────────────────────────────────
//
// The framework's documentation says `@page` implies lazy loading and code splitting: one chunk
// with every page in it would mean opening `/` downloads the whole application.
//
// The subject is the ENTRY — what a visitor waits for before anything renders — not the total.
// Splitting does not remove bytes, it moves them out of the first request, so the total is expected
// to stay roughly the same and the entry is expected to fall.

/** The entry chunk: the one index.html loads directly. */
function entryChunk(): string {
    const html = readFileSync(resolve(DIST, '..', 'index.html'), 'utf8');
    const m = html.match(/src="\/assets\/([^"]+\.js)"/);
    if (!m) throw new Error('index.html loads no module script — nothing to measure');
    return m[1];
}

test('the build produces more than one JavaScript chunk', () => {
    const js = readdirSync(DIST).filter((f) => f.endsWith('.js'));
    expect(js.length, 'one chunk means every route is in the first download').toBeGreaterThan(1);
});

test('the entry does not carry a route the visitor has not asked for', () => {
    // A marker only the intervention PAGE emits. Not its title and not its nav label: the shell
    // links to it, so "Intervention 2" is in the entry legitimately.
    //
    // Not a sentence of the page's either: every sentence in the app is in `locales/*.json`, and
    // where a dictionary is loaded is the dictionaries' business, not the route's. Only the page's
    // markup is the page's own.
    const MARKER = 'intervention-ticket';
    const entry = readFileSync(join(DIST, entryChunk()), 'utf8');
    expect(entry, 'the intervention page is in the chunk that loads on `/`').not.toContain(MARKER);

    // And the control: it IS somewhere, in a chunk of its own.
    const elsewhere = readdirSync(DIST)
        .filter(f => f.endsWith('.js') && f !== entryChunk())
        .some(f => readFileSync(join(DIST, f), 'utf8').includes(MARKER));
    expect(elsewhere, 'the page is in no chunk at all — the assertion above proves nothing').toBe(true);
});

test('and the entry is smaller than the whole of the JavaScript', () => {
    const all = readdirSync(DIST).filter((f) => f.endsWith('.js'));
    const total = all.reduce((s, f) => s + gzipSync(readFileSync(join(DIST, f))).length, 0);
    const entry = gzipSync(readFileSync(join(DIST, entryChunk()))).length;
    console.log(`[bundle] entry ${(entry / 1024).toFixed(1)} KB gzipped of ${(total / 1024).toFixed(1)} KB total`);
    expect(entry, 'the entry is the whole bundle — nothing was split out of it').toBeLessThan(total);
});
