/**
 * A generated app in a browser (#160, part 5c): `pdx build --ssg` wrote a page per route
 * (`scenarios/ssg/`, built in `scenarios-build.ts`), and the app takes it over at boot.
 *
 * Taken over, not rendered again: every element the parser made from the file is still in the page
 * once the app runs — a MutationObserver installed before the first byte is parsed records each
 * element removed, and the heading the parser made is the heading the page holds. Then the page
 * works as a mounted one does: a click updates its count, a link navigates inside the app and keeps
 * the layout.
 */
import { test, expect, type Page } from './fixture';
import type { Server } from 'node:http';
import { scenarioDist } from './scenarios-build';
import { serveSite } from './static-site';

let site: { url: string; server: Server };
test.beforeAll(async () => { site = await serveSite(scenarioDist('ssg')); });
test.afterAll(async () => { await new Promise((r) => site.server.close(r)); });

/** Record, from before the page is parsed, the elements removed and the first heading the parser made. */
async function watch(page: Page): Promise<string[]> {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => {
        const w = window as unknown as { __removed: string[]; __parsedTitle: Element | null };
        w.__removed = [];
        w.__parsedTitle = null;
        new MutationObserver((records) => {
            for (const r of records) {
                for (const n of r.removedNodes) if (n instanceof Element) w.__removed.push(n.outerHTML.slice(0, 120));
                for (const n of r.addedNodes) {
                    if (!w.__parsedTitle && n instanceof Element) w.__parsedTitle = n.matches('h1') ? n : n.querySelector('h1');
                }
            }
        }).observe(document, { childList: true, subtree: true });
    });
    return errors;
}

const removed = (page: Page) => page.evaluate(() => (window as unknown as { __removed: string[] }).__removed);
const sameTitle = (page: Page) => page.evaluate(() => {
    const w = window as unknown as { __parsedTitle: Element | null };
    return w.__parsedTitle !== null && w.__parsedTitle === document.querySelector('h1');
});

test('the page for a route holds its content before any script runs', async ({ page }) => {
    const html = await (await page.request.get(`${site.url}/`)).text();
    expect(html).toContain('<h1 data-test="title">Home</h1>');
    expect(html).toContain('written by the server');
    expect(html).toContain('data-pdx-ssg="/"');
    const about = await (await page.request.get(`${site.url}/about`)).text();
    expect(about).toContain('About us');
});

test('the app takes the page over: nothing the server wrote is rebuilt', async ({ page }) => {
    const errors = await watch(page);
    await page.goto(`${site.url}/`);
    const count = page.locator('[data-test="count"]');
    await count.click();
    await expect(count, 'the click did nothing: the page was not hydrated').toHaveText('1');
    expect(await removed(page), 'elements the server wrote were removed').toEqual([]);
    expect(await sameTitle(page), 'the heading is not the one the parser made from the file').toBe(true);
    await expect(page.locator('[data-test="card"]')).toHaveText('written by the server');
    expect(errors).toEqual([]);
});

test('after taking over, a link navigates inside the app and the layout stays', async ({ page }) => {
    const errors = await watch(page);
    await page.goto(`${site.url}/`);
    await expect(page.locator('[data-test="count"]')).toBeVisible();
    const header = await page.locator('[data-test="header"]').elementHandle();
    await page.locator('[data-test="to-about"]').click();
    await expect(page.locator('h1')).toHaveText('About us');
    expect(new URL(page.url()).pathname).toBe('/about');
    expect(await page.evaluate((h) => h === document.querySelector('[data-test="header"]'), header), 'the layout was rebuilt').toBe(true);
    expect(errors).toEqual([]);
});

test('a @hydrate part waits, and the first click on it takes it over and counts once', async ({ page }) => {
    const errors = await watch(page);
    await page.goto(`${site.url}/`);
    // The page is live: the part's trigger is ten minutes away, so only the click can take it over.
    const count = page.locator('[data-test="count"]');
    await count.click();
    await expect(count).toHaveText('1');
    const later = page.locator('[data-test="later"]');
    await expect(later).toHaveText('0');
    await later.click();
    await expect(later, 'the click before the part was live was lost, or counted twice').toHaveText('1');
    await later.click();
    await expect(later).toHaveText('2');
    expect(await removed(page), 'elements the server wrote were removed').toEqual([]);
    expect(errors).toEqual([]);
});

test('a page entered directly is taken over too', async ({ page }) => {
    const errors = await watch(page);
    await page.goto(`${site.url}/about`);
    await expect(page.locator('h1')).toHaveText('About us');
    // The outlet resolves after the router boots: wait for it to have read its mark.
    await expect(page.locator('pdx-router-outlet')).not.toHaveAttribute('data-pdx-ssg');
    expect(await removed(page), 'elements the server wrote were removed').toEqual([]);
    expect(await sameTitle(page)).toBe(true);
    expect(errors).toEqual([]);
});
