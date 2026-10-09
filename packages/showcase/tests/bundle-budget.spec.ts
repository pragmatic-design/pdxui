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
 * `inlineBindings`, measured.
 *
 * The flag swaps `html``` for imperative DOM construction; `PDX_INLINE_BINDINGS=1 vite build` is
 * how this app is built the other way. Both numbers, same machine, same commit:
 *
 *                     entry      JS total     CSS
 *   template          20.5 KB    30.4 KB      18.9 KB
 *   inlineBindings    20.6 KB    30.8 KB      18.9 KB
 *
 * So it is **slightly bigger on the wire** — imperative DOM code is more instructions than a
 * template string. It is not the interesting number.
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
 * The flag is off in this app's build, and the reason is not the size: with it on, a `<slot>`
 * inside a component's tag is dropped from the emitted module.
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
const BUDGET_KB = { entry: 34, js: 362, css: 59, blocking: 88 };
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
