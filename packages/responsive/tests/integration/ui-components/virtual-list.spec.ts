// `@for … @virtual` (#283), measured in Chromium through what it compiles to, `eachVirtual`: the
// rows that exist are the rows in view, the rows stay children of their `<ul>`, and the two spacers
// that stand for the rest are hidden from assistive technology.
//
// The harness renders 40 px items in a 400 px `<ul>`: ten in view, three of overscan on each side.
import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

/** The list's rows — its `<li>`, the spacers and the @empty row aside. */
const rows = (page: Page) => page.locator('[data-test="list"] > li:not([aria-hidden]):not([data-test="empty"])');
const spacers = (page: Page) => page.locator('[data-test="list"] > li[aria-hidden="true"]');

/** Let the observers and the window settle. */
async function frames(page: Page, n = 4): Promise<void> {
    await page.evaluate((count) => new Promise<void>((resolve) => {
        let left = count;
        const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
    }), n);
}

/** Scroll the list to its end, and let it settle. */
async function scrollToEnd(page: Page): Promise<void> {
    await page.locator('[data-test="list"]').evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await frames(page);
}

test.describe('10 000 items in a 400 px list', () => {
    test.beforeEach(async ({ page }) => {
        await openPage(page, '/virtual-list.html');
        await rows(page).first().waitFor();
        await frames(page);
    });

    test('only the visible rows and 2 × overscan are in the DOM, beside two spacers', async ({ page }) => {
        const count = await rows(page).count();
        // 10 in view + 3 of overscan below (none above at the top), and one more partly in view.
        expect(count, `${count} rows for 10 000 items`).toBeGreaterThanOrEqual(10);
        expect(count).toBeLessThanOrEqual(10 + 2 * 3 + 1);
        await expect(spacers(page)).toHaveCount(2);
    });

    test('scrolling to the end renders the last item, and the count stays bounded', async ({ page }) => {
        await scrollToEnd(page);
        await expect(rows(page).last()).toHaveText('Item 9999');
        expect(await rows(page).count()).toBeLessThanOrEqual(10 + 2 * 3 + 1);
    });

    test('the rows are the <ul>\'s own children, in order, and the spacers are aria-hidden', async ({ page }) => {
        const order = await page.locator('[data-test="list"] > li').evaluateAll((els) => els.map((el) => el.getAttribute('aria-hidden') ?? el.textContent));
        expect(order[0], 'the top spacer is not first').toBe('true');
        expect(order[order.length - 1], 'the bottom spacer is not last').toBe('true');
        expect(order.slice(1, 4)).toEqual(['Item 0', 'Item 1', 'Item 2']);
    });

    test('the scroll height still describes the whole list', async ({ page }) => {
        const height = await page.locator('[data-test="list"]').evaluate((el) => el.scrollHeight);
        expect(Math.abs(height - 10000 * 40), `scroll height ${height}`).toBeLessThanOrEqual(2);
    });
});

test.describe('a paged source: 3 pages of 50', () => {
    test('scrolling to the end loads once per page, and never after the last', async ({ page }) => {
        await openPage(page, '/virtual-list.html?source=paged');
        await rows(page).first().waitFor();
        for (let i = 0; i < 5; i++) {
            await scrollToEnd(page);
            await page.waitForTimeout(80); // the fake source answers after 30 ms
        }
        expect(await page.evaluate(() => (window as unknown as { __loadMoreCalls: number }).__loadMoreCalls)).toBe(2);
        await scrollToEnd(page);
        await expect(rows(page).last()).toHaveText('Item 149');
    });

    test('an empty source that is not loading renders @empty', async ({ page }) => {
        await openPage(page, '/virtual-list.html?source=empty');
        await expect(page.locator('[data-test="empty"]')).toBeVisible();
    });

    test('control — an empty source that is loading does not', async ({ page }) => {
        await openPage(page, '/virtual-list.html?source=loading');
        await frames(page);
        await expect(page.locator('[data-test="empty"]')).toHaveCount(0);
    });
});
