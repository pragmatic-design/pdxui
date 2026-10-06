/**
 * A component page keeps its demos when its route resolves again.
 *
 * The gallery effect clears the gallery, loads the demo module, appends a fresh `pdx-comp-<name>` and
 * polls 20 frames for a <section> in it, emptying the gallery if none appears. A second resolution of
 * the same route — a new `currentParams()` object with the same values, which a `$derived` passes on
 * as a change — runs the effect again. If the first run keeps polling the element the second removed,
 * twenty frames later it wipes the second run's gallery, which has rendered, and the page shows
 * "Full interactive demos are being finalized". An awaited before-hook puts the generated router's
 * second resolution after mount, which is how it happens in practice.
 *
 * Two same-URL navigations in one task give two resolutions of the route at once, deterministically.
 */
import { test, expect, type Page } from '@playwright/test';

/** Let `n` animation frames pass: the gallery's own check gives up after 20. */
function frames(page: Page, n: number): Promise<void> {
    return page.evaluate((count) => new Promise<void>((resolve) => {
        let left = count;
        const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
    }), n);
}

const sections = (page: Page) => page.locator('.cmp-gallery section');
const placeholder = (page: Page) => page.getByText('Full interactive demos are being finalized');

test('the dialog page keeps its demos when its route resolves twice at once', async ({ page }) => {
    await page.goto('/components/dialog', { waitUntil: 'networkidle' });
    await expect(sections(page).first(), 'the gallery never rendered: the case measures nothing').toBeVisible();

    await page.evaluate(() => {
        const nav = (window as unknown as { navigation: { navigate(url: string): unknown } }).navigation;
        nav.navigate(location.href);
        nav.navigate(location.href);
    });
    await frames(page, 40);

    expect(await sections(page).count(), 'the demos were wiped').toBeGreaterThan(0);
    await expect(placeholder(page)).toHaveCount(0);
});

test('the control: another tab of the same component still rebuilds the gallery', async ({ page }) => {
    await page.goto('/components/chart', { waitUntil: 'networkidle' });
    await expect(page.locator('.cmp-gallery pdx-comp-chart section').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Advanced' }).click();
    await expect(page.locator('.cmp-gallery pdx-comp-chart-advanced section').first(), 'the Advanced tab did not rebuild the gallery').toBeVisible();
    await expect(page.locator('.cmp-gallery pdx-comp-chart')).toHaveCount(0);
});

test('the control: moving to another component still rebuilds its gallery', async ({ page }) => {
    await page.goto('/components/dialog', { waitUntil: 'networkidle' });
    await expect(sections(page).first()).toBeVisible();
    await page.evaluate(() => {
        (window as unknown as { navigation: { navigate(url: string): unknown } }).navigation.navigate('/components/drawer');
    });
    await expect(page.locator('.cmp-gallery pdx-comp-drawer section').first(), 'the drawer gallery did not replace the dialog one').toBeVisible();
    await expect(page.locator('.cmp-gallery pdx-comp-dialog')).toHaveCount(0);
});
