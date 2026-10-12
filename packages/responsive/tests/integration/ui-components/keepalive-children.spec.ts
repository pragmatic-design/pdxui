// The child components of a kept-alive page are frozen with it, not destroyed (#268; beta spec,
// lifecycle.md, «The matrix», row «child components»: frozen with the page, resumed with `onShow`;
// «Acceptance cases», case 2).
//
// The outlet freezes a keep-alive page by moving it into a DocumentFragment and marks only the page
// `_keepAlive`. A child component, disconnected by the same move, ran its full cleanup: navigating
// back set it up again, and whatever it held was gone. Measured in Chromium, on the hand-written
// page keepalive-children.html: a router outlet, a kept-alive page, a child holding a counter.

import { test, expect, type Page } from './contracts/fixture';
import { openPage } from './contracts/measure';

type Log = { setup: number; destroy: number; show: number; hide: number };
const log = (page: Page) => page.evaluate(() => ({ ...(window as unknown as { __lifecycle: Log }).__lifecycle }));
const go = (page: Page, to: string) => page.evaluate((path) => (window as unknown as { __go: (p: string) => void }).__go(path), to);

test.describe('a kept-alive page\'s child component', () => {
    test('keeps its state across a freeze, set up once, hidden and shown', async ({ page }) => {
        await openPage(page, '/keepalive-children.html');
        const count = page.locator('[data-test="count"]');
        await expect(count).toHaveText('0');
        for (let i = 0; i < 3; i++) await page.locator('[data-test="inc"]').click();
        await expect(count).toHaveText('3');

        await go(page, '/');
        await expect(page.locator('[data-test="other"]')).toBeVisible();
        await expect(page.locator('pdx-ka-counter'), 'the frozen page is still in the document').toHaveCount(0);

        await go(page, '/keep');
        await expect(count, 'the child lost its state: it was destroyed and set up again').toHaveText('3');
        const after = await log(page);
        expect(after.setup, 'the child\'s setup ran more than once').toBe(1);
        expect(after.destroy, 'the child was destroyed by the freeze').toBe(0);
        expect(after.hide, 'the child was not told it is hidden').toBe(1);
        expect(after.show, 'the child was not told it is shown again').toBe(1);
    });

    test('is destroyed when the frozen page is destroyed for good', async ({ page }) => {
        // keepAlive: 50 ms — after that the outlet discards the frozen page.
        await openPage(page, '/keepalive-children.html?timeout=50');
        await expect(page.locator('[data-test="count"]')).toHaveText('0');
        await go(page, '/');
        await expect(page.locator('[data-test="other"]')).toBeVisible();
        await expect.poll(async () => (await log(page)).destroy, { message: 'the discarded page\'s child never ran onDestroy' }).toBe(1);
    });
});
