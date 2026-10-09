/**
 * A split route is fetched before the click.
 *
 * The application is out of the first download: a route is its own chunk and arrives the first
 * time it is shown. That MOVES the wait rather than removing it — the first click on a route stalls
 * for a round trip. `@prefetch` is the answer, and only if it fetches the route's JavaScript: a
 * `<pdx-link prefetch="hover">` that asks the server for `/tickets/1` gets the SPA fallback —
 * `index.html` — and never the route's code.
 *
 * So the subject here is the NETWORK, on the real build: which files the browser asked for, and
 * when. Counting is the only way to tell a prefetch that happened from one that was declared.
 */
import { test, expect, type Page } from './fixture';

/**
 * The JavaScript files the browser asked for, in order, as file NAMES.
 *
 * Not stripped of their hash: Vite's hash contains `-`, so a "tidy the name" regex takes off the
 * wrong piece and the assertion fails on a prefetch that actually happened.
 */
function watchChunks(page: Page): string[] {
    const seen: string[] = [];
    page.on('request', (r) => {
        const url = r.url();
        if (url.endsWith('.js')) seen.push(url.split('/').pop()!);
    });
    return seen;
}

/** Was a chunk built from `<name>.pdx` among them? */
const has = (files: string[], chunk: string): boolean => files.some(f => f.startsWith(chunk + '-'));

async function open(page: Page, path: string): Promise<void> {
    // The links hovered below are the rail's Customers and Board, favourites on a first visit. The
    // menu lists no single record: a record is reached from its list.
    await page.goto(path);
    await expect(page.locator('pdx-app .app-bar')).toBeVisible();
}

test.describe('hovering a link to a split route', () => {
    test('fetches its chunk before the click', async ({ page }) => {
        const chunks = watchChunks(page);
        await open(page, '/');
        expect(has(chunks, 'customers'), 'the customers chunk was already downloaded — nothing was split')
            .toBe(false);

        await page.locator('[data-test="to-customers"]').hover();
        await expect.poll(() => has(chunks, 'customers'), { message: 'hovering the link fetched no chunk' })
            .toBe(true);
    });

    test('and then the click renders it with no further request', async ({ page }) => {
        await open(page, '/');
        await page.locator('[data-test="to-customers"]').hover();
        await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource').length))
            .toBeGreaterThan(0);

        // Count only what happens from HERE: the prefetch is already done.
        const after: string[] = [];
        page.on('request', (r) => { if (r.url().endsWith('.js')) after.push(r.url()); });

        await page.locator('[data-test="to-customers"]').click();
        await expect(page.locator('.app main [data-test="customers"]')).toBeVisible();
        expect(after, 'the click fetched the chunk again — the prefetch did not reach the module cache')
            .toEqual([]);
    });

    test('control — WITHOUT the hover, the same click does fetch it', async ({ page }) => {
        // Without this the test above passes on a build that never split anything, which is the
        // failure mode every "it was already there" assertion has.
        await open(page, '/');

        const onClick: string[] = [];
        page.on('request', (r) => { if (r.url().endsWith('.js')) onClick.push(r.url().split('/').pop()!); });

        await page.locator('[data-test="to-customers"]').dispatchEvent('click');
        await expect(page.locator('.app main [data-test="customers"]')).toBeVisible();
        expect(has(onClick, 'customers'), 'the chunk was already in the entry — this app does not measure prefetching')
            .toBe(true);
    });
});

test('a keyboard user gets it too, on focus', async ({ page }) => {
    // Hover is a mouse. The keyboard's signal that a navigation is coming is focus, and a feature
    // that only helps one of the two is half a feature.
    const chunks = watchChunks(page);
    await open(page, '/');

    // The rail's entry is the <a> itself, which is what a Tab lands on; `focusin` bubbles to the menu.
    await page.locator('[data-test="to-board"]').focus();
    await expect.poll(() => has(chunks, 'board'), { message: 'tabbing to the link fetched no chunk' })
        .toBe(true);
});
