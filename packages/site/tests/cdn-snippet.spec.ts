// The "Prebuilt components from a CDN" snippet of the integration page works as written (#1163).
//
// The page promised components with no build, from `https://unpkg.com/@pdxui/ui`. The library's
// modules import @pdxui/core and their own stylesheets by bare name, which a browser cannot load, so
// that snippet registered nothing. @pdxui/ui now ships a browser entry, named by its `unpkg` field, and
// @pdxui/design names its flattened stylesheet the same way.
//
// A CDN is modelled, not called: this server answers `/@pdxui/<name>` with the file the package's
// `unpkg` field names, as unpkg does, and `/@pdxui/<name>/<path>` with a file the package publishes.
// It serves the packages of this tree (their `dist/`, which CI builds before the browser suites), so
// what is measured is what the next publish ships. The snippet comes from the page itself, with the
// unpkg origin swapped for this server's: change the page and this measures the change.

import { test, expect } from './fixture';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const PACKAGES = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAGE = join(PACKAGES, 'site', 'content', 'docs', 'integration.md');
const UNPKG = 'https://unpkg.com/';

const TYPES: Record<string, string> = {
    '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.map': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.html': 'text/html',
};

/** The `html` block under the page's CDN heading: the snippet a reader copies. */
function cdnSnippet(): string {
    const page = readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
    const section = page.split('\n## Prebuilt components from a CDN\n')[1]?.split('\n## ')[0];
    const block = section?.match(/```html\n([\s\S]*?)```/)?.[1];
    if (!block) throw new Error('integration.md has no html block under "Prebuilt components from a CDN"');
    return block;
}

/** The package directory for `@pdxui/<name>`, with an `@version` suffix ignored. */
function packageDir(name: string): string | null {
    const dir = join(PACKAGES, name.replace(/@.*$/, ''));
    return existsSync(join(dir, 'package.json')) ? dir : null;
}

/** The file a package's `unpkg` field names, which the CDN redirects its bare name to. */
function unpkgField(dir: string): string | null {
    return (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { unpkg?: string }).unpkg ?? null;
}

/** A file the package publishes, at `rest` under it. */
function resolveFile(dir: string, rest: string): string | null {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { files?: string[] };
    const published = (pkg.files ?? []).map((f) => f.replace(/\/$/, ''));
    if (rest !== 'package.json' && !published.some((f) => rest === f || rest.startsWith(`${f}/`))) return null;
    const file = resolve(dir, rest);
    return file.startsWith(dir + sep) && existsSync(file) && statSync(file).isFile() ? file : null;
}

/** A page that loads one component and core's API at the paths the page's prose names. */
const ONE_COMPONENT = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${UNPKG}@pdxui/design">
<script type="module">
    import '${UNPKG}@pdxui/ui/dist/browser/button/pdx-button.js';
    import { signal, effect } from '${UNPKG}@pdxui/ui/dist/browser/core.js';
    const busy = signal(true);
    effect(() => { document.querySelector('pdx-button').disabled = busy(); });
    window.__release = () => busy.set(false);
</script></head><body><pdx-button variant="primary">Save</pdx-button></body></html>`;

let server: Server;
let origin: string;
const served: string[] = [];

test.beforeAll(async () => {
    const snippet = cdnSnippet();
    server = createServer((req, res) => {
        const path = decodeURIComponent(new URL(req.url ?? '/', 'http://cdn').pathname);
        served.push(path);
        // A CDN answers any origin, as unpkg does: a page elsewhere imports these modules cross-origin.
        res.setHeader('access-control-allow-origin', '*');
        if (path === '/') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>${snippet.split(UNPKG).join(`${origin}/`)}</body></html>`);
            return;
        }
        if (path === '/one-component') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(ONE_COMPONENT.split(UNPKG).join(`${origin}/`));
            return;
        }
        const match = path.match(/^\/@pdxui\/([^/]+)\/?(.*)$/);
        const dir = match ? packageDir(match[1]) : null;
        // The bare name redirects to the `unpkg` file, as unpkg does: the module's own URL is then the
        // file's, and the relative imports of its chunks resolve beside it.
        if (dir && match![2] === '') {
            const target = unpkgField(dir);
            if (target) { res.writeHead(302, { location: `/@pdxui/${match![1]}/${target}` }); res.end(); return; }
        }
        const file = dir ? resolveFile(dir, match![2]) : null;
        if (!file) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        res.end(readFileSync(file));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((done) => server.close(() => done())));

test('the CDN snippet registers the components, styles them, and drives them with core\'s API', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

    await page.goto(`${origin}/`);
    await page.waitForFunction(() => customElements.get('pdx-button') && customElements.get('pdx-badge'));

    // Styled: the design stylesheet reached the button, which a primary button shows as a filled background.
    const root = page.locator('pdx-button [data-part="root"]');
    await expect(root).toBeVisible();
    const background = await root.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(background, 'the primary button has no fill: the stylesheet did not load').not.toMatch(/^rgba\(0, 0, 0, 0\)$|^transparent$/);

    // Core's API from the same URL drives the components: the snippet counts clicks into the badge.
    await root.click();
    await root.click();
    await expect(page.locator('pdx-badge')).toContainText('2');

    expect(errors).toEqual([]);
    // One core: the bundle carries it, so the page never asks the CDN for @pdxui/core.
    expect(served.filter((p) => p.startsWith('/@pdxui/core'))).toEqual([]);
});

test('one component and core\'s API load on their own, at the paths the page names', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const before = served.length;
    // The page's prose: `…/@pdxui/ui/dist/browser/button/pdx-button.js` and `…/dist/browser/core.js`.
    await page.goto(`${origin}/one-component`);
    await page.waitForFunction(() => customElements.get('pdx-button'), undefined, { timeout: 10_000 })
        .catch((e: Error) => { throw new Error(`${e.message}\npage errors: ${errors.join('\n') || '(none)'}`); });

    const button = page.locator('pdx-button [data-part="root"]');
    await expect(button).toBeDisabled();
    // core.js's signal drives the button the button module registered: they run on one core.
    await page.evaluate(() => (window as unknown as { __release: () => void }).__release());
    await expect(button).toBeEnabled();
    expect(await button.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toMatch(/^rgba\(0, 0, 0, 0\)$|^transparent$/);

    // Only what was asked for: no other component registered, and the whole-library entry never fetched.
    expect(await page.evaluate(() => Boolean(customElements.get('pdx-badge')))).toBe(false);
    expect(served.slice(before).filter((p) => p.endsWith('/pdx-ui.js'))).toEqual([]);
    expect(errors).toEqual([]);
});
