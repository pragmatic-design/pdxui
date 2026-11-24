/**
 * A `@try` around a `<slot>` keeps the projected children across a Retry (#1365), in Chromium: slot
 * projection and the order components mount in are a browser's, not happy-dom's.
 *
 * The fixture, `tests/fixtures/try-slot/`, is a page of its own served by the dev server: a compiled
 * `.pdx` whose template is `@try { <slot></slot> } @catch (err, retry) { … }`, around a child that
 * throws on its first mount. The fallback clears what is between the boundary's markers, and a Retry
 * that rendered a new `<slot>` would come back empty: nothing fills a slot after mount.
 */
import { test, expect } from './fixture';

const FIXTURE = '/tests/fixtures/try-slot/index.html';

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE);
    await page.waitForFunction(() => (window as unknown as { __ts?: { ready: boolean } }).__ts?.ready === true);
});

test('a child that throws shows the @catch body in its place', async ({ page }) => {
    await expect(page.locator('#boundary .fallback')).toHaveText('the child failed');
    await expect(page.locator('#boundary .child')).toHaveCount(0);
});

test('Retry brings the projected child back, mounted again', async ({ page }) => {
    await expect(page.locator('#boundary .retry')).toBeVisible();
    await page.locator('#boundary .retry').click();
    await expect(page.locator('#boundary .fallback')).toHaveCount(0);
    // The same element the page wrote, not a new one: the boundary kept it.
    await expect(page.locator('#boundary #flaky .child')).toHaveText('the child');
    expect(await page.evaluate(() => (window as unknown as { __tsMounts: number }).__tsMounts)).toBe(2);
});
