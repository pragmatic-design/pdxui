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
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * gzip kB the entry chunk may weigh. Measured at 859 kB, 198 kB gzip — the
 * runtime, the router, the shell and routes, and the UI manifest (custom-elements.json, ~420 kB
 * unminified, read by the nav and the component pages). The budget leaves ~25% for growth and is
 * still well below either regression it guards: TypeScript back in the entry is ~900 kB gzip more.
 */
const ENTRY_BUDGET_KB = 250;

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

test('the entry chunk is under the budget', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    const src = html.match(/<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/)?.[1];
    expect(src, 'no module entry script in dist/index.html').toBeTruthy();
    const bytes = readFileSync(join(dist, src!));
    const gzipKb = gzipSync(bytes).length / 1024;
    expect(gzipKb, `${src}: ${(bytes.length / 1024).toFixed(0)} kB, ${gzipKb.toFixed(0)} kB gzip`).toBeLessThanOrEqual(ENTRY_BUDGET_KB);
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
