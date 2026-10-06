/**
 * `@scroll`, against the production build.
 *
 * The generated router passes `config.scroll` to the restoration as the interpreted one does. With
 * three arguments instead of four, core's decision collapses to `restoring = isBack` and BOTH
 * declarations become no-ops — `'top'` restores on Back, `'preserve'` does not restore on a forward
 * navigation. Development runs interpreted, so a developer who declares `@scroll` watches it work
 * and ships the other router.
 *
 * Three things this file does because of what happens without them:
 *
 *  1. **a short viewport** — ten rows in a tall window do not scroll, and the assertion becomes 0
 *     against 0;
 *  2. **clicks dispatched in the page**, never `locator.click()`: Playwright scrolls its target
 *     into view first, which moves the offset before the router saves it and makes a working
 *     restoration look broken;
 *  3. **`history.scrollRestoration = 'manual'`** — Chromium restores the offset on a traversal by
 *     itself, so a green test would say nothing about this framework.
 */
import { test, expect, type Page } from '@playwright/test';
import { pinInRail } from './rail';

/**
 * Click a link the way a person does: in the page, with no scrolling-into-view first.
 *
 * The rail's entry IS the link; its controls are beside it, not inside, so `querySelector('a')` on
 * anything else finds the entry's link and not an «open in a new tab» one.
 */
const clickIn = (page: Page, testId: string) =>
    page.evaluate((id) => {
        const el = document.querySelector(`[data-test="${id}"]`) as HTMLElement | null;
        (el?.matches('a') ? el : el?.querySelector('a'))?.click();
    }, testId);

const offset = (page: Page) => page.evaluate(() => window.scrollY);

async function openList(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1280, height: 420 });
    // The rows below leave the list by the rail's Intake: pinned, since the rail carries the
    // reader's favourites.
    await pinInRail(page, 'intake');
    await page.goto('/tickets');
    await expect(page.locator('[data-test="grid"] [role="row"]').first()).toBeVisible();
    await page.evaluate(() => { history.scrollRestoration = 'manual'; });
}

test("@scroll 'preserve' restores on a FORWARD navigation, which nothing else does", async ({ page }) => {
    await openList(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    const left = await offset(page);
    expect(left, 'the list did not scroll, so this measures 0 against 0').toBeGreaterThan(300);

    // Away, and back by a LINK — not the Back button. A list restores on Back by default; this is
    // the half only the declaration gives, and the half a production build was dropping.
    await clickIn(page, 'to-intake');
    await expect(page.locator('[data-test="intake"]')).toBeVisible();
    await clickIn(page, 'to-tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();

    await expect.poll(() => offset(page),
        { message: "@scroll 'preserve' did not reach the restoration: the list opened at the top" })
        .toBeGreaterThan(left - 60);
});

test("@scroll 'top' opens at the top even on Back, where the default restores", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 420 });
    await page.goto('/tickets/1');
    await expect(page.locator('[data-test="ticket"]')).toBeVisible();
    await page.evaluate(() => { history.scrollRestoration = 'manual'; });

    await page.evaluate(() => window.scrollTo(0, 300));
    const left = await offset(page);
    expect(left, 'the ticket page did not scroll, so this measures 0 against 0').toBeGreaterThan(200);

    await clickIn(page, 'to-tickets');
    await expect(page.locator('[data-test="tickets"]')).toBeVisible();

    await page.goBack();
    await expect(page.locator('[data-test="ticket"]')).toBeVisible();

    // Back is exactly the case the default gets right and this declaration overrides: without the
    // fourth argument core sees `restoring = isBack` and puts the page back at 300.
    await expect.poll(() => offset(page),
        { message: "@scroll 'top' was ignored: Back restored the old offset" })
        .toBeLessThan(40);
});
