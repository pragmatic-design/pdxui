/**
 * The DEPLOYED builder — what themebuilder.pdxui.com actually serves.
 *
 * This suite exists because the static build broke in a way nothing else could see. In dev
 * the catalog, the theme list and the scenario pages come out of the repo; in a build they
 * have to become files under this package. `catalog.json` and `themes.json` are fetched and
 * imported by nothing, so Vite emitted neither — and `vite preview` answered both with
 * index.html under its SPA fallback. Every request was 200. curl was happy. The site was a
 * shell with no components in it.
 *
 * So the assertions here are deliberately about CONTENT, never about status codes: a 200 is
 * exactly what a missing file looks like on this server.
 *
 * Runs against `vite build` + `vite preview` (see playwright.static.config.ts), not the dev
 * server — testing the dev server here would test the thing that already worked.
 */
import { test, expect, type Page } from '@playwright/test';

const APP = '/';
const SCENARIO = 'component=button&scenario=button-variants&theme=cupertino&scheme=light';

test.use({ viewport: { width: 1600, height: 1000 } });

async function open(page: Page, query: string): Promise<void> {
    await page.goto(`${APP}?${query}`);
    await page.waitForFunction(() => !!(globalThis as Record<string, unknown>).__pdx_builder);
}

/** Fetched from inside the page: same origin, same server, same fallback as the real app. */
const fetchText = (page: Page, url: string) =>
    page.evaluate(async (u) => {
        const res = await fetch(u);
        return { status: res.status, type: res.headers.get('content-type') ?? '', body: await res.text() };
    }, url);

test('the catalog is served as JSON, not as the index fallback', async ({ page }) => {
    await open(page, SCENARIO);

    const res = await fetchText(page, '/scenarios/catalog.json');
    expect(res.status).toBe(200);
    // The bug, stated: an HTML body behind a 200.
    expect(res.body.slice(0, 20), 'a missing asset is answered with index.html').not.toContain('<!DOCTYPE');

    const catalog = JSON.parse(res.body) as { components: { name: string; scenarios: unknown[] }[] };
    expect(catalog.components.length, 'the whole component set has to be there').toBeGreaterThan(50);
    expect(catalog.components.some(c => c.name === 'button')).toBe(true);
});

test('the theme list is a file now, and it is the real one', async ({ page }) => {
    await open(page, SCENARIO);

    const res = await fetchText(page, '/scenarios/themes.json');
    expect(res.body.slice(0, 20)).not.toContain('<!DOCTYPE');
    const themes = JSON.parse(res.body) as { shipped: string[]; custom: string[] };
    expect(themes.shipped).toContain('cupertino');
    expect(themes.shipped).toContain('material');

    // …and the app is using it, rather than falling back to its hardcoded list. If the fetch
    // failed silently, this would still be non-empty — so it is compared to the file.
    const shown = await page.evaluate(() => (globalThis as any).__pdx_builder.themes().all as string[]);
    expect(shown.sort()).toEqual([...themes.shipped, ...themes.custom].sort());
});

test('a component actually renders in the deployed preview', async ({ page }) => {
    await open(page, SCENARIO);
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('html')).toHaveAttribute('data-pdx-ready', '1');
    await expect(frame.locator('html')).toHaveAttribute('pdx-theme', 'cupertino');

    // Registered custom element, not inert markup: the scenario page's own modules were
    // bundled and ran.
    const upgraded = await page.evaluate(() => {
        const doc = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
        return !!doc.defaultView!.customElements.get('pdx-button');
    });
    expect(upgraded).toBe(true);
    await expect(frame.locator('section:not([hidden]) button').first()).toBeVisible();
});

test('the oracle measures the deployed page, and the panel says so', async ({ page }) => {
    await open(page, SCENARIO);
    const report = await page.evaluate(async () => await (globalThis as any).__pdx_builder.measure());
    expect(report.error).toBeUndefined();
    expect(report.total, 'a static build must be judged like the dev one').toBeGreaterThan(0);
    expect(report.notes.join(' ')).toContain('Colour IS judged');
    await expect(page.locator('[data-test="verdict"]')).toBeVisible();
});

test('saving is absent, because a static site has nowhere to write', async ({ page }) => {
    await open(page, `${SCENARIO}&mode=theme`);
    await expect(page.locator('[data-test="save-theme"]')).toHaveCount(0);
    // Export stays: it is a download, and it is the whole point of the deployed builder.
    await expect(page.locator('[data-test="export-css"]')).toBeVisible();
    await expect(page.locator('[data-test="export-dtcg"]')).toBeVisible();
});

test('the deployment files ride along, and there is no SPA fallback in them', async ({ page }) => {
    await open(page, SCENARIO);

    const cname = await fetchText(page, '/CNAME');
    expect(cname.body.trim(), 'the domain must ship with the build').toBe('themebuilder.pdxui.com');

    // `deploy/README.md` is documentation for us, not content for the site — it must not be
    // published. Asserted on content, not on a status code: preview answers everything 200.
    const readme = await fetchText(page, '/README.md');
    expect(readme.body).not.toContain('Deploying the builder');
});

test('the composite screen is deployed too', async ({ page }) => {
    await open(page, `${SCENARIO}&mode=theme&name=probe-theme`);
    // Not the index fallback, and not an unprocessed copy: its module graph was bundled,
    // so the inline `import '@pdxui/ui'` is gone and a built asset is referenced.
    const res = await fetchText(page, '/preview/composition.html');
    expect(res.body).toContain('data-pdx-ready');
    expect(res.body).not.toContain("import '@pdxui/ui'");

    await page.locator('[data-test="composition"]').click();
    const frame = page.frameLocator('iframe');
    await expect(frame.locator('html')).toHaveAttribute('data-pdx-ready', '1');
    // The DRAFT, not the shipped theme in the URL: in theme mode the composite screen is
    // where the theme being authored is judged. Showing `cupertino` here would be the bug.
    await expect(frame.locator('html')).toHaveAttribute('pdx-theme', 'probe-theme');
    await expect(frame.locator('[class*="pdx-surface-card"]').first()).toBeVisible();
});
