/**
 * The site's entry chunk stays under a stated budget.
 *
 * Two imports can bloat it: the compiler (which parses with TypeScript, ~9.3 MB of `typescript.js`)
 * pulled in eagerly by the playground route, on every page of the site — the entry is then 5.4 MB,
 * 1.4 MB gzip; and every docs page's pre-rendered HTML (848 kB, `api.md` alone 605 kB), imported
 * eagerly by the docs and search routes.
 *
 * The budget is on the gzipped size, which is what a first visit downloads. It runs on the dist the
 * suite's web server just built. Node-side: no browser.
 */
import { test, expect } from './fixture';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * gzip kB the entry chunk may weigh. Measured at 782 kB, 182.5 kB gzip — the runtime, the router
 * and its route table, the shell, and the UI manifest (custom-elements.json, ~420 kB unminified,
 * read by the nav and the component pages). No route: each is its own chunk (#303; with the
 * routes imported eagerly it was 1008 kB, 240 kB gzip). The budget leaves ~25% for growth and is
 * still well below either regression it guards: the routes back in the entry are ~58 kB gzip more,
 * TypeScript ~900 kB.
 */
const ENTRY_BUDGET_KB = 228;

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

test('the entry chunk is under the budget', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const src = html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/)?.[1];
    expect(src, 'no module entry script in dist/index.html').toBeTruthy();
    const bytes = readFileSync(join(dist, src!));
    const gzipKb = gzipSync(bytes).length / 1024;
    expect(gzipKb, `${src}: ${(bytes.length / 1024).toFixed(0)} kB, ${gzipKb.toFixed(0)} kB gzip`).toBeLessThanOrEqual(ENTRY_BUDGET_KB);
});

/**
 * kB a docs page's chunk may weigh: Vite's own warning threshold. A page loads only when it is
 * opened, but it is one download to read one section of it. The API reference was one page, 636 kB
 * to look up one export; it is one page per module now (scripts/gen-api.mjs, MODULE_PAGES).
 */
const DOC_CHUNK_KB = 500;

test('no docs page is a chunk over the budget', () => {
    const docs = readdirSync(fileURLToPath(new URL('../content/docs/', import.meta.url)))
        .filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
    const chunks = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js'));
    const sizes: string[] = [];
    let found = 0;
    for (const slug of docs) {
        // Vite names a doc's chunk after its file: `api-reactivity-<hash>.js`.
        const chunk = chunks.find(f => new RegExp(`^${slug}-[\\w-]{8}\\.js$`).test(f));
        if (!chunk) continue;
        found++;
        const kb = statSync(join(dist, 'assets', chunk)).size / 1024;
        if (kb > DOC_CHUNK_KB) sizes.push(`${chunk}: ${kb.toFixed(0)} kB`);
    }
    expect(found, 'no docs chunk found: the naming this test reads has changed').toBeGreaterThan(10);
    expect(sizes, 'docs chunks over the budget').toEqual([]);
});

test('no route is in the entry chunk — the route table loads each one', () => {
    // A route in the entry is a component registered there: `component("app-docs", { … })`, which
    // minifies to `("app-docs",{props:` or `{setup:`. The route TABLE names every route too, as
    // `tag:"app-docs"`, and that is meant to be in the entry: it is how the router knows a route
    // it has not loaded. An eager `import.meta.glob` of the routes in index.html put all eight in
    // the entry, the lazy `import()`s of the table bought nothing, and Vite said so in a warning.
    const routes = readdirSync(fileURLToPath(new URL('../src/routes/', import.meta.url)))
        .filter(f => f.endsWith('.pdx')).map(f => `app-${f.replace(/\.pdx$/, '')}`);
    expect(routes.length, 'no routes found: the folder this test reads has moved').toBeGreaterThan(5);
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const src = html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/)![1];
    const code = readFileSync(join(dist, src), 'utf8');
    const inEntry = routes.filter(tag => new RegExp(`\\(["']${tag}["'],\\{(props|setup|render|styles)\\b`).test(code));
    expect(inEntry, 'routes registered in the entry chunk').toEqual([]);
    // Control: the table is there, naming them — so the assertion above is not passing on an entry
    // that lost the router altogether.
    expect(routes.filter(tag => !code.includes(`tag:"${tag}"`)), 'routes the entry\'s route table does not name').toEqual([]);
});

test('the compiler and TypeScript are not in the entry chunk', () => {
    // The playground compiles in the browser; nothing else does. Its compiler loads with it.
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const src = html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/)![1];
    const code = readFileSync(join(dist, src), 'utf8');
    // Strings only TypeScript's own source carries, and one only the PDX compiler's codegen does.
    expect(code.includes('ts.ScriptTarget') || code.includes('createSourceFile'), 'TypeScript is in the entry chunk').toBe(false);
    expect(code.includes('__pdxSlot_'), 'the PDX compiler is in the entry chunk').toBe(false);
});
